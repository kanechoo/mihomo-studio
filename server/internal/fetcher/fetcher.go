// Package fetcher retrieves a document from a URL the caller chose.
//
// Everything here exists because of that last clause. An endpoint that makes
// this process issue a request to an address someone else picked is a way to
// reach whatever this process can reach and nobody else can: the metadata
// service of the instance it runs on, a database admin page bound to localhost,
// the private range the container sits in. So the address actually dialled is
// checked on every connection, the size and duration of the transfer are
// bounded, and redirects — the usual way past a check performed once on the
// original URL — are re-checked and capped.
package fetcher

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"
)

// Errors a caller distinguishes. Anything else is a transport failure and means
// the upstream, not the request.
var (
	// ErrInvalidURL means the string is not a URL this can act on at all.
	ErrInvalidURL = errors.New("that is not a valid URL")
	// ErrScheme is a URL for something other than HTTP — `file:`, `gopher:`,
	// and the rest of the schemes that make a fetcher interesting to abuse.
	ErrScheme = errors.New("only http and https URLs can be fetched")
	// ErrBlocked is an address inside the network this server sits in.
	ErrBlocked = errors.New("that host resolves to an address this server will not fetch from")
	// ErrTooLarge means the response exceeded MaxBytes. Reported rather than
	// truncated: half a YAML document parses as a different, wrong document.
	ErrTooLarge = errors.New("the document is larger than this server will fetch")
	// ErrNotText means the body is not UTF-8, so it is not a subscription.
	ErrNotText = errors.New("the response is not a text document")
	// ErrUpstreamStatus carries the status the other server answered with.
	ErrUpstreamStatus = errors.New("the subscription server refused the request")
)

// Defaults, used for any option left at its zero value.
const (
	DefaultTimeout  = 15 * time.Second
	DefaultMaxBytes = 2 << 20 // 2 MiB; a large Clash config is ~50 KiB
	// Subscription services routinely vary their response format by User-Agent
	// — the same URL answers YAML to a Clash client and a base64 URI list to
	// something else. The point of this path is to get what a proxy client
	// would get, so it says it is one.
	DefaultUserAgent = "clash.meta/1.19.0"

	// A redirect or two is normal (http→https, a CDN hop). A chain longer than
	// this is either a loop or someone walking a filter.
	maxRedirects = 3
)

// Options configure a Client. The zero value is usable.
type Options struct {
	Timeout   time.Duration
	MaxBytes  int64
	UserAgent string
}

// Document is a fetched body and what the server said it was.
type Document struct {
	Content     string
	ContentType string
}

type Client struct {
	http      *http.Client
	maxBytes  int64
	userAgent string
}

func New(opts Options) *Client {
	return newClient(opts, blockPrivateAddresses)
}

// newClient is New with the address filter injectable.
//
// It exists for the tests, which have to reach an httptest server — and those
// listen on loopback, which the real filter refuses, correctly. The filter
// itself is exercised separately against the same servers.
func newClient(opts Options, control func(network, address string, c syscall.RawConn) error) *Client {
	if opts.Timeout <= 0 {
		opts.Timeout = DefaultTimeout
	}
	if opts.MaxBytes <= 0 {
		opts.MaxBytes = DefaultMaxBytes
	}
	if strings.TrimSpace(opts.UserAgent) == "" {
		opts.UserAgent = DefaultUserAgent
	}

	dialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
		// The check that matters. Control runs after the name has been resolved
		// and before the socket is connected, with the address about to be
		// dialled — which is the only place the answer cannot be changed
		// afterwards. Validating the hostname instead leaves the gap between the
		// lookup that passed and the lookup the dial performs: a name whose
		// record has a one-second TTL and two answers is a filter bypass, and
		// the technique is old enough to have a name (DNS rebinding).
		Control: control,
	}

	transport := &http.Transport{
		DialContext: dialer.DialContext,
		// Deliberately no proxy, not even from the environment. A proxy would
		// make the connection somebody else's decision, and the address filter
		// above would then be inspecting the proxy rather than the target.
		Proxy:                 nil,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          10,
		IdleConnTimeout:       30 * time.Second,
	}

	return &Client{
		http: &http.Client{
			Transport: transport,
			Timeout:   opts.Timeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= maxRedirects {
					return fmt.Errorf("stopped after %d redirects", maxRedirects)
				}
				// The dial filter re-runs for each hop, so only the scheme needs
				// restating here: a redirect to `file:///etc/passwd` never dials
				// anything and would otherwise slip past it.
				return checkScheme(req.URL)
			},
		},
		maxBytes:  opts.MaxBytes,
		userAgent: opts.UserAgent,
	}
}

// Fetch retrieves the document at rawURL.
func (c *Client) Fetch(ctx context.Context, rawURL string) (Document, error) {
	trimmed := strings.TrimSpace(rawURL)

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return Document{}, fmt.Errorf("%w: %v", ErrInvalidURL, err)
	}
	// Scheme before host: `file:///etc/passwd` parses fine and has no host, and
	// reporting that as a malformed URL would hide what is actually wrong with
	// it.
	if err := checkScheme(parsed); err != nil {
		return Document{}, err
	}
	if parsed.Host == "" {
		return Document{}, ErrInvalidURL
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return Document{}, fmt.Errorf("%w: %v", ErrInvalidURL, err)
	}
	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Accept", "*/*")

	resp, err := c.http.Do(req)
	if err != nil {
		// Unwrapped from the *url.Error the client wraps every failure in, so a
		// blocked address is reported as the caller's mistake rather than as an
		// outage — and so the message does not quote the internal address that
		// was refused.
		if errors.Is(err, ErrBlocked) {
			return Document{}, ErrBlocked
		}
		if errors.Is(err, ErrScheme) {
			return Document{}, ErrScheme
		}
		return Document{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return Document{}, fmt.Errorf("%w: HTTP %d", ErrUpstreamStatus, resp.StatusCode)
	}

	// One byte past the limit, so that hitting it is distinguishable from a
	// document that happens to be exactly MaxBytes long.
	body, err := io.ReadAll(io.LimitReader(resp.Body, c.maxBytes+1))
	if err != nil {
		return Document{}, err
	}
	if int64(len(body)) > c.maxBytes {
		return Document{}, ErrTooLarge
	}
	if !utf8.Valid(body) {
		return Document{}, ErrNotText
	}

	return Document{
		Content:     string(body),
		ContentType: resp.Header.Get("Content-Type"),
	}, nil
}

func checkScheme(u *url.URL) error {
	switch strings.ToLower(u.Scheme) {
	case "http", "https":
		return nil
	default:
		return ErrScheme
	}
}

// blockPrivateAddresses refuses to connect to anything that is not a public
// address.
//
// Written as a deny-what-is-not-allowed rather than a list of bad ranges:
// IsGlobalUnicast already excludes loopback, unspecified, multicast and
// link-local, which leaves the private and reserved ranges to name explicitly.
func blockPrivateAddresses(_, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return fmt.Errorf("%w: %s", ErrBlocked, address)
	}

	addr, err := netip.ParseAddr(host)
	if err != nil {
		// Control is always handed a resolved literal. A name here would mean
		// something resolved elsewhere, which is exactly what must not happen.
		return fmt.Errorf("%w: %s", ErrBlocked, host)
	}

	if !isPublic(addr) {
		return fmt.Errorf("%w: %s", ErrBlocked, addr)
	}
	return nil
}

// Ranges that are routable in the sense IsGlobalUnicast means, but are not the
// public internet.
var reserved = []netip.Prefix{
	netip.MustParsePrefix("100.64.0.0/10"),   // CGNAT — carrier equipment
	netip.MustParsePrefix("192.0.0.0/24"),    // IETF protocol assignments
	netip.MustParsePrefix("192.0.2.0/24"),    // documentation
	netip.MustParsePrefix("198.18.0.0/15"),   // benchmarking
	netip.MustParsePrefix("198.51.100.0/24"), // documentation
	netip.MustParsePrefix("203.0.113.0/24"),  // documentation
	netip.MustParsePrefix("240.0.0.0/4"),     // reserved, incl. 255.255.255.255
	netip.MustParsePrefix("64:ff9b::/96"),    // NAT64 — a way to write an IPv4 target
	netip.MustParsePrefix("2002::/16"),       // 6to4, likewise
}

func isPublic(addr netip.Addr) bool {
	// ::ffff:127.0.0.1 is loopback written as IPv6, and passes an IPv6-only
	// check. Unmapping first makes both spellings answer the same.
	addr = addr.Unmap()

	if !addr.IsGlobalUnicast() || addr.IsPrivate() {
		return false
	}
	// fec0::/10, deprecated but still routed by some stacks.
	if addr.Is6() && addr.As16()[0] == 0xfe && addr.As16()[1]&0xc0 == 0xc0 {
		return false
	}
	for _, prefix := range reserved {
		if prefix.Contains(addr) {
			return false
		}
	}
	return true
}
