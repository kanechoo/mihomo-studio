package model

import "time"

// GeositeTag is one entry in the Mihomo geosite catalogue — a site list the
// editor's rules and DNS settings can reference, such as CATEGORY-ADS-ALL or
// DOUBAN.
//
// The table is reference data, not tenant data: it has no owner, nothing in
// this service writes to it after its seed migration runs, and it changes only
// through a new versioned migration (see 0003_geosite_tags.sql). That is why
// there is no UpdatedAt — a row's contents are fixed at birth.
type GeositeTag struct {
	// The tag exactly as Mihomo accepts it. It doubles as the primary key: the
	// catalogue is a set of names, and a duplicate would carry no extra meaning.
	Name string `gorm:"column:name;primaryKey;size:64" json:"name"`

	// True for curated bundles (category-*), which most rules actually use.
	// Stored rather than derived so the read path's ordering — bundles first,
	// then alphabetical — is an index scan instead of a per-row expression.
	IsCategory bool `gorm:"column:is_category;not null" json:"-"`

	CreatedAt time.Time `json:"created_at"`
}

func (GeositeTag) TableName() string { return "geosite_tags" }
