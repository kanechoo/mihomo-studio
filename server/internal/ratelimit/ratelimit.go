// Package ratelimit is an in-process token bucket keyed by an arbitrary string.
//
// In-process, and therefore per-instance: two replicas each allow the
// configured rate, and a restart forgets everything. Both are acceptable here
// and neither is worth a Redis dependency. What this defends against is a
// client polling a subscription URL in a tight loop and a caller working
// through URLs from a script — volume, not precision — and halving the
// effective limit per replica would be a worse trade than the accounting drift.
package ratelimit

import (
	"math"
	"sync"
	"time"
)

// maxKeys bounds the map. Keys come from callers — one per client IP, one per
// subscription token — so nothing but this stops a caller from spending the
// service's memory a bucket at a time.
const maxKeys = 50_000

// Limiter hands out tokens at a fixed rate, per key.
type Limiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket

	// Tokens per second, and the most a bucket can hold. burst equals the limit,
	// so an idle client may spend its whole allowance at once and then waits.
	rate  float64
	burst float64

	// idle is how long an untouched bucket is kept, and equals the window: after
	// exactly that long a bucket has refilled to burst, which makes it
	// indistinguishable from one that was never seen. Dropping it then loses no
	// information at all.
	idle      time.Duration
	lastSweep time.Time

	// Injectable so tests can advance time instead of sleeping through a window.
	now func() time.Time
}

type bucket struct {
	tokens float64
	last   time.Time
}

// New allows limit requests per window for each key.
func New(limit int, window time.Duration) *Limiter {
	if limit < 1 {
		limit = 1
	}
	if window <= 0 {
		window = time.Minute
	}

	return &Limiter{
		buckets: make(map[string]*bucket),
		rate:    float64(limit) / window.Seconds(),
		burst:   float64(limit),
		idle:    window,
		now:     time.Now,
	}
}

// Allow reports whether the key may proceed, and if not, how long until it can.
//
// An empty key is always allowed: it means "this limiter does not apply to this
// request", which is how a key function declines to bucket something another
// limiter already covers.
func (l *Limiter) Allow(key string) (bool, time.Duration) {
	if key == "" {
		return true, 0
	}

	now := l.now()

	l.mu.Lock()
	defer l.mu.Unlock()

	l.sweep(now)

	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	} else {
		b.tokens = math.Min(l.burst, b.tokens+now.Sub(b.last).Seconds()*l.rate)
		b.last = now
	}

	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}

	// Rounded up, because a Retry-After that expires a fraction of a second early
	// sends a well-behaved client straight into a second refusal.
	wait := time.Duration((1 - b.tokens) / l.rate * float64(time.Second))
	return false, wait.Round(time.Second) + time.Second
}

// sweep drops buckets nothing is using. Called under the lock, from Allow, so
// the limiter needs no goroutine of its own and nothing has to remember to stop
// it.
func (l *Limiter) sweep(now time.Time) {
	overCap := len(l.buckets) > maxKeys
	if !overCap && now.Sub(l.lastSweep) < l.idle {
		return
	}
	l.lastSweep = now

	for key, b := range l.buckets {
		if now.Sub(b.last) >= l.idle {
			delete(l.buckets, key)
		}
	}

	if len(l.buckets) <= maxKeys {
		return
	}

	// Still over the cap, so the keys are genuinely active — many distinct
	// clients, or one caller manufacturing them. Evict the buckets nearest full
	// first: those are the keys that have barely been used, and forgetting one
	// costs nothing, whereas forgetting a nearly-empty bucket would hand its
	// owner a fresh allowance.
	for key, b := range l.buckets {
		if len(l.buckets) <= maxKeys {
			break
		}
		if b.tokens > l.burst/2 {
			delete(l.buckets, key)
		}
	}

	// Every remaining bucket is heavily used and there are still too many. Memory
	// is the harder limit to recover from, so the map goes; the cost is one extra
	// burst per key, which is finite, where an unbounded map is not.
	if len(l.buckets) > maxKeys {
		l.buckets = make(map[string]*bucket)
	}
}

// Len reports how many keys are being tracked. For tests and diagnostics.
func (l *Limiter) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}
