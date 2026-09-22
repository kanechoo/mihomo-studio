package fetcher

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"syscall"
	"testing"
)

// A dialler filter that permits everything, so a test can reach the httptest
// server on loopback. Anything testing the filter itself uses New instead.
func allowAll(_, _ string, _ syscall.RawConn) error { return nil }

func testClient(t *testing.T, opts Options) *Client {
	t.Helper()
	return newClient(opts, allowAll)
}

func TestFetchReadsTheDocument(t *testing.T) {
	const body = "proxies:\n  - name: 香港 🇭🇰\n"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// The User-Agent decides which format many providers answer with, so it
		// is part of the contract rather than a detail.
		if ua := r.Header.Get("User-Agent"); ua != DefaultUserAgent {
			t.Errorf("User-Agent = %q, want %q", ua, DefaultUserAgent)
		}
		w.Header().Set("Content-Type", "text/vnd.yaml")
		_, _ = w.Write([]byte(body))
	}))
	defer server.Close()

	doc, err := testClient(t, Options{}).Fetch(context.Background(), server.URL)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if doc.Content != body {
		t.Errorf("Content = %q, want %q", doc.Content, body)
	}
	if doc.ContentType != "text/vnd.yaml" {
		t.Errorf("ContentType = %q, want text/vnd.yaml", doc.ContentType)
	}
}

// A document one byte over the limit is refused rather than cut short. A
// truncated YAML file still parses — into a different configuration.
func TestFetchRefusesOversizeDocuments(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(strings.Repeat("a", 101)))
	}))
	defer server.Close()

	_, err := testClient(t, Options{MaxBytes: 100}).Fetch(context.Background(), server.URL)
	if !errors.Is(err, ErrTooLarge) {
		t.Fatalf("Fetch error = %v, want ErrTooLarge", err)
	}
}

func TestFetchAcceptsExactlyTheLimit(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(strings.Repeat("a", 100)))
	}))
	defer server.Close()

	doc, err := testClient(t, Options{MaxBytes: 100}).Fetch(context.Background(), server.URL)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(doc.Content) != 100 {
		t.Errorf("read %d bytes, want 100", len(doc.Content))
	}
}

func TestFetchRefusesBinaryBodies(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte{0xff, 0xfe, 0x00, 0x01})
	}))
	defer server.Close()

	_, err := testClient(t, Options{}).Fetch(context.Background(), server.URL)
	if !errors.Is(err, ErrNotText) {
		t.Fatalf("Fetch error = %v, want ErrNotText", err)
	}
}

func TestFetchReportsUpstreamStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer server.Close()

	_, err := testClient(t, Options{}).Fetch(context.Background(), server.URL)
	if !errors.Is(err, ErrUpstreamStatus) {
		t.Fatalf("Fetch error = %v, want ErrUpstreamStatus", err)
	}
	// The status is quoted back because an expired subscription token shows up
	// as a 403 and that is the user's to fix.
	if !strings.Contains(err.Error(), "403") {
		t.Errorf("error = %q, want it to name the status", err)
	}
}

func TestFetchRejectsNonHTTPSchemes(t *testing.T) {
	for _, raw := range []string{"file:///etc/passwd", "gopher://example.com/", "ftp://example.com/x"} {
		_, err := testClient(t, Options{}).Fetch(context.Background(), raw)
		if !errors.Is(err, ErrScheme) {
			t.Errorf("Fetch(%q) error = %v, want ErrScheme", raw, err)
		}
	}
}

func TestFetchRejectsMalformedURLs(t *testing.T) {
	for _, raw := range []string{"", "   ", "not a url", "https://"} {
		_, err := testClient(t, Options{}).Fetch(context.Background(), raw)
		if err == nil {
			t.Errorf("Fetch(%q) succeeded, want an error", raw)
		}
	}
}

// The one that matters: a URL that looks public but resolves to this machine.
// The production client is used deliberately — this is the filter under test.
func TestFetchBlocksLoopbackTargets(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		t.Error("the handler was reached; the address filter did not run")
	}))
	defer server.Close()

	_, err := New(Options{}).Fetch(context.Background(), server.URL)
	if !errors.Is(err, ErrBlocked) {
		t.Fatalf("Fetch error = %v, want ErrBlocked", err)
	}
	// The refused address must not come back out: on this endpoint it is what
	// the caller was probing for.
	if strings.Contains(err.Error(), "127.0.0.1") {
		t.Errorf("error = %q, which quotes the internal address", err)
	}
}

// A redirect is where a filter applied once to the original URL gets walked
// past. The dial filter re-runs per hop, so the redirect target is checked too.
func TestFetchBlocksRedirectToLoopback(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		t.Error("the redirect target was reached; the address filter did not run")
	}))
	defer target.Close()

	// Redirects from a permitted host to a blocked one. The first hop is allowed
	// by the injected filter; the second is judged by the real one.
	hops := 0
	redirector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hops++
		http.Redirect(w, r, target.URL, http.StatusFound)
	}))
	defer redirector.Close()

	client := newClient(Options{}, func(network, address string, c syscall.RawConn) error {
		if hops == 0 {
			return nil // the first dial, to the redirector
		}
		return blockPrivateAddresses(network, address, c)
	})

	_, err := client.Fetch(context.Background(), redirector.URL)
	if !errors.Is(err, ErrBlocked) {
		t.Fatalf("Fetch error = %v, want ErrBlocked", err)
	}
}

func TestFetchStopsAfterTooManyRedirects(t *testing.T) {
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, server.URL, http.StatusFound)
	}))
	defer server.Close()

	_, err := testClient(t, Options{}).Fetch(context.Background(), server.URL)
	if err == nil {
		t.Fatal("Fetch succeeded on a redirect loop, want an error")
	}
	if !strings.Contains(err.Error(), "redirect") {
		t.Errorf("error = %q, want it to mention redirects", err)
	}
}

func TestFetchRejectsRedirectToNonHTTPScheme(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "file:///etc/passwd", http.StatusFound)
	}))
	defer server.Close()

	_, err := testClient(t, Options{}).Fetch(context.Background(), server.URL)
	if !errors.Is(err, ErrScheme) {
		t.Fatalf("Fetch error = %v, want ErrScheme", err)
	}
}

func TestIsPublic(t *testing.T) {
	blocked := []string{
		"127.0.0.1",        // loopback
		"::1",              // loopback, v6
		"::ffff:127.0.0.1", // loopback wearing a v6 address
		"0.0.0.0",          // unspecified
		"10.1.2.3",         // RFC1918
		"172.16.0.1",       // RFC1918
		"192.168.1.1",      // RFC1918
		"169.254.169.254",  // link-local: the cloud metadata service
		"fd00::1",          // unique local
		"fe80::1",          // link-local, v6
		"fec0::1",          // site-local, deprecated but still routed
		"100.64.0.1",       // CGNAT
		"224.0.0.1",        // multicast
		"255.255.255.255",  // broadcast
		"198.18.0.1",       // benchmarking
		"192.0.2.1",        // documentation
		"64:ff9b::7f00:1",  // NAT64 spelling of 127.0.0.1
		"2002:7f00:1::",    // 6to4 spelling of the same
	}
	for _, raw := range blocked {
		addr := netip.MustParseAddr(raw)
		if isPublic(addr) {
			t.Errorf("isPublic(%s) = true, want false", raw)
		}
	}

	allowed := []string{"1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "150.242.90.148"}
	for _, raw := range allowed {
		addr := netip.MustParseAddr(raw)
		if !isPublic(addr) {
			t.Errorf("isPublic(%s) = false, want true", raw)
		}
	}
}

func TestNewAppliesDefaults(t *testing.T) {
	c := New(Options{})
	if c.maxBytes != DefaultMaxBytes {
		t.Errorf("maxBytes = %d, want %d", c.maxBytes, DefaultMaxBytes)
	}
	if c.userAgent != DefaultUserAgent {
		t.Errorf("userAgent = %q, want %q", c.userAgent, DefaultUserAgent)
	}
	if c.http.Timeout != DefaultTimeout {
		t.Errorf("timeout = %s, want %s", c.http.Timeout, DefaultTimeout)
	}
}
