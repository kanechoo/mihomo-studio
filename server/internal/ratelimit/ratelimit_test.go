package ratelimit

import (
	"strings"
	"sync"
	"testing"
	"time"
)

// clock returns a limiter whose time the test controls, so a window can pass in
// a nanosecond instead of a minute.
func clocked(limit int, window time.Duration) (*Limiter, func(time.Duration)) {
	l := New(limit, window)
	now := time.Unix(1_700_000_000, 0)
	l.now = func() time.Time { return now }
	return l, func(d time.Duration) { now = now.Add(d) }
}

// The property the endpoint depends on: a caller gets its allowance and then
// stops getting anything, without the limiter having to be told when the window
// started.
func TestAllowsTheBurstThenRefuses(t *testing.T) {
	l, _ := clocked(3, time.Minute)

	for i := 1; i <= 3; i++ {
		if ok, _ := l.Allow("client"); !ok {
			t.Fatalf("request %d was refused; the first 3 are the allowance", i)
		}
	}

	ok, retryAfter := l.Allow("client")
	if ok {
		t.Fatal("the 4th request was allowed; the limit is 3 per minute")
	}
	if retryAfter <= 0 {
		t.Errorf("retryAfter = %s, want a positive duration for the Retry-After header", retryAfter)
	}
	// A caller told to come back later must actually be able to: the wait has to
	// cover the refill, or a client that obeys it is refused again on arrival.
	if retryAfter > time.Minute {
		t.Errorf("retryAfter = %s, longer than the whole window", retryAfter)
	}
}

func TestRefillsOverTime(t *testing.T) {
	l, advance := clocked(6, time.Minute)

	for i := 0; i < 6; i++ {
		l.Allow("client")
	}
	if ok, _ := l.Allow("client"); ok {
		t.Fatal("expected the allowance to be spent")
	}

	// A sixth of the window is one token.
	advance(10 * time.Second)
	if ok, _ := l.Allow("client"); !ok {
		t.Error("no token after a sixth of the window; the bucket is not refilling")
	}
	if ok, _ := l.Allow("client"); ok {
		t.Error("two tokens after a sixth of the window; it is refilling too fast")
	}

	// A full window restores the whole allowance and no more.
	advance(time.Minute)
	for i := 1; i <= 6; i++ {
		if ok, _ := l.Allow("client"); !ok {
			t.Fatalf("request %d refused after a full window", i)
		}
	}
	if ok, _ := l.Allow("client"); ok {
		t.Error("the bucket refilled past its burst")
	}
}

// Buckets must not be shared, or one busy subscription would refuse every other
// one — which is the failure this limiter is supposed to prevent, not cause.
func TestKeysAreIndependent(t *testing.T) {
	l, _ := clocked(2, time.Minute)

	l.Allow("a")
	l.Allow("a")
	if ok, _ := l.Allow("a"); ok {
		t.Fatal("expected a to be spent")
	}

	if ok, _ := l.Allow("b"); !ok {
		t.Error("b was refused because a spent its allowance")
	}
}

// An empty key means "this limiter does not apply", which is how a key function
// hands a request to a different limiter instead of bucketing it.
func TestEmptyKeyIsAlwaysAllowed(t *testing.T) {
	l, _ := clocked(1, time.Minute)

	for i := 0; i < 100; i++ {
		if ok, _ := l.Allow(""); !ok {
			t.Fatalf("empty key refused on request %d", i)
		}
	}
	if n := l.Len(); n != 0 {
		t.Errorf("Len = %d, want 0; an empty key must not take a bucket", n)
	}
}

// The map is keyed by something callers choose, so it has to shed entries on its
// own. A bucket untouched for a whole window has refilled to full and is
// indistinguishable from one that was never created.
func TestIdleBucketsAreDropped(t *testing.T) {
	l, advance := clocked(5, time.Minute)

	for i := 0; i < 50; i++ {
		l.Allow(strings.Repeat("k", i+1))
	}
	if n := l.Len(); n != 50 {
		t.Fatalf("Len = %d, want 50", n)
	}

	// Sweeping happens inside Allow, so time passing is not enough on its own —
	// one more request is what triggers it.
	advance(2 * time.Minute)
	l.Allow("trigger")

	if n := l.Len(); n != 1 {
		t.Errorf("Len = %d, want 1 (only the request that triggered the sweep)", n)
	}
}

// Two clients hitting the same key from different goroutines is the normal case
// on a shared subscription URL, and the counters have to survive it. Run with
// -race for this to mean anything.
func TestConcurrentUseIsSafe(t *testing.T) {
	l := New(1000, time.Minute)

	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				l.Allow("shared")
			}
		}()
	}
	wg.Wait()

	// 800 requests against an allowance of 1000 leaves 200, so the next one is
	// allowed. A lost update would show up as the bucket being empty.
	if ok, _ := l.Allow("shared"); !ok {
		t.Error("the shared bucket ran out after 800 of 1000 requests; increments were lost")
	}
}
