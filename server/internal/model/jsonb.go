package model

import (
	"database/sql/driver"
	"errors"
	"fmt"
)

// JSONB is a raw JSON document stored in a PostgreSQL jsonb column.
//
// It deliberately stays as raw bytes instead of a decoded map: the server never
// interprets the IR, so decoding into map[string]any and re-encoding would only
// add a way to corrupt it. Go's decoder turns every number into a float64,
// which silently rounds any integer past 2^53 — and proxy configs are full of
// long numeric IDs and ports.
//
// What passing the bytes through does not buy is byte-for-byte storage: jsonb
// normalises on the way in. Object keys come back in PostgreSQL's own order
// rather than the editor's, and duplicate keys are collapsed. Neither matters
// for the IR — JSON objects are unordered by definition and the frontend parses
// them straight back into JS objects — while **array** order, which carries
// real meaning here (proxy precedence, rule evaluation order), is preserved
// exactly. Switching the column to `json` would keep the bytes verbatim at the
// cost of every future ability to index or query inside the document.
type JSONB []byte

// Value implements driver.Valuer. An empty document becomes SQL NULL rather
// than the empty string, which is not valid jsonb and would fail on insert.
func (j JSONB) Value() (driver.Value, error) {
	if len(j) == 0 {
		return nil, nil
	}
	return string(j), nil
}

// Scan implements sql.Scanner.
func (j *JSONB) Scan(src any) error {
	if src == nil {
		*j = nil
		return nil
	}
	switch v := src.(type) {
	case []byte:
		// The driver is free to reuse its read buffer once Scan returns, so the
		// bytes are copied rather than aliased.
		*j = append((*j)[:0], v...)
	case string:
		*j = []byte(v)
	default:
		return fmt.Errorf("model: cannot scan %T into JSONB", src)
	}
	return nil
}

// MarshalJSON emits the stored document itself. Without this, encoding/json
// would treat the underlying []byte as binary and base64-encode it, so every
// API response would carry an unreadable blob where the IR should be.
func (j JSONB) MarshalJSON() ([]byte, error) {
	if len(j) == 0 {
		return []byte("null"), nil
	}
	return j, nil
}

// UnmarshalJSON captures the request's raw bytes verbatim.
func (j *JSONB) UnmarshalJSON(data []byte) error {
	if j == nil {
		return errors.New("model: UnmarshalJSON on nil JSONB")
	}
	*j = append((*j)[:0], data...)
	return nil
}

// GormDataType backs up the explicit `type:jsonb` column tags, so a field that
// forgets the tag still gets a jsonb column instead of bytea.
func (JSONB) GormDataType() string { return "jsonb" }
