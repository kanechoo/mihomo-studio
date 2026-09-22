package handler

import (
	"strings"
	"testing"
)

// The config name reaches an HTTP header, and the user chooses the config name.
// A name containing CR/LF would end the Content-Disposition header and let
// everything after it be read as headers of its own — an extra Set-Cookie, say,
// on a response the browser already trusts.
func TestContentDispositionCannotInjectHeaders(t *testing.T) {
	hostile := []string{
		"home\r\nSet-Cookie: admin=1",
		"home\nX-Injected: yes",
		"home\r\n\r\n<html>",
		"quote\"break",
		"back\\slash",
		"nul\x00byte",
	}

	for _, name := range hostile {
		got := contentDisposition(name + ".yaml")
		if strings.ContainsAny(got, "\r\n\x00") {
			t.Errorf("contentDisposition(%q) = %q, which carries a control character", name, got)
		}
		// The quoted-string form must not be terminated early either: after the
		// opening quote there is exactly one more, and it closes the value.
		if n := strings.Count(got, `"`); n != 2 {
			t.Errorf("contentDisposition(%q) = %q, which has %d quotes, want 2", name, got, n)
		}
	}
}

// A name written in a non-Latin script has to survive in filename*, because
// that is the whole reason the second form exists — a phone importing the
// profile should show 家里, not five underscores.
func TestContentDispositionKeepsNonAsciiNames(t *testing.T) {
	got := contentDisposition("家里.yaml")

	// UTF-8 for 家里 is E5 AE B6 E9 87 8C, percent-encoded byte by byte.
	const want = "filename*=UTF-8''%E5%AE%B6%E9%87%8C.yaml"
	if !strings.Contains(got, want) {
		t.Errorf("contentDisposition = %q, want it to contain %q", got, want)
	}
	// And the ASCII fallback must still be a usable name rather than empty.
	if !strings.Contains(got, `filename="config.yaml"`) {
		t.Errorf("contentDisposition = %q, want an ASCII fallback of config.yaml", got)
	}
}

func TestContentDispositionKeepsOrdinaryNames(t *testing.T) {
	got := contentDisposition("home.yaml")
	if !strings.Contains(got, `filename="home.yaml"`) {
		t.Errorf("contentDisposition = %q, want it to contain filename=\"home.yaml\"", got)
	}
	if !strings.HasPrefix(got, "attachment; ") {
		t.Errorf("contentDisposition = %q, want it to start with attachment; ", got)
	}
}

func TestAsciiFilenameFallsBackWhenNothingSurvives(t *testing.T) {
	for _, name := range []string{"", "家里", "\x00\x01", "___"} {
		if got := asciiFilename(name); got == "" {
			t.Errorf("asciiFilename(%q) is empty; a client reading only filename= would get nothing", name)
		}
	}
}
