package service

import (
	"context"
	"sync"
	"time"

	"mihomo-studio-server/internal/repository"
)

// geositeCacheTTL bounds how long the catalogue is held in memory. The table
// only changes through a migration, which needs a deploy — so within one
// process lifetime the cache can never show anything the database would not.
// The TTL exists for the operator who seeds or repairs the table by hand and
// expects to see it without a restart.
const geositeCacheTTL = 15 * time.Minute

// Geosite serves the geosite tag catalogue behind GET /api/v1/geosite.
type Geosite struct {
	tags *repository.GeositeRepository

	mu    sync.Mutex
	names []string
	until time.Time
}

func NewGeosite(tags *repository.GeositeRepository) *Geosite {
	return &Geosite{tags: tags}
}

// List returns every tag, bundles first. The whole catalogue is small —
// roughly fifteen hundred short strings — so it is read as one slice and cached
// process-wide: the endpoint is unauthenticated, which makes it the one place a
// third party can spend this service's database reads, and there is no query
// narrower than "everything" to serve anyway.
//
// A failed read is not cached, so an unreachable database degrades to per-
// request queries rather than being remembered as empty.
func (s *Geosite) List(ctx context.Context) ([]string, error) {
	s.mu.Lock()
	cached, ok := s.names, s.until.After(time.Now())
	s.mu.Unlock()
	if ok {
		return cached, nil
	}

	names, err := s.tags.ListNames(ctx)
	if err != nil {
		return nil, err
	}
	if names == nil {
		names = []string{}
	}

	s.mu.Lock()
	s.names = names
	s.until = time.Now().Add(geositeCacheTTL)
	s.mu.Unlock()

	return names, nil
}
