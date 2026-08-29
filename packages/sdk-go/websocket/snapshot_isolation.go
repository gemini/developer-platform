package websocket

import (
	"context"
	"errors"
	"fmt"
)

// ErrAmbiguousSnapshot indicates that a symbol-less order-book snapshot could
// not be assigned to exactly one active depth feed.
var ErrAmbiguousSnapshot = errors.New("gemini websocket: symbol-less order-book snapshot is ambiguous")

// ErrMalformedSnapshot indicates that an order-book snapshot envelope was
// recognized but did not contain the required fields or valid price levels.
var ErrMalformedSnapshot = errors.New("gemini websocket: malformed order-book snapshot")

func (c *Client) usesIsolatedSnapshots() bool {
	return c.isolateSnapshots && c.snapshotMode && !c.privateOnly
}

func (c *Client) usesIsolatedPartialSnapshots() bool {
	// Partial-depth snapshots are symbol-less regardless of whether the
	// connection also requests a differential-depth baseline.
	return (c.isolateSnapshots || c.isolatePartialSnapshots) && !c.privateOnly
}

func (c *Client) acquireIsolatedSnapshotClient(symbol string) (*Client, error) {
	return c.acquireIsolatedClient(symbol, c.snapshotValue, c.snapshotClients, c.snapshotClientRefs)
}

func (c *Client) acquireIsolatedPartialSnapshotClient(symbol string) (*Client, error) {
	return c.acquireIsolatedClient(symbol, 0, c.partialSnapshotClients, c.partialSnapshotRefs)
}

func (c *Client) acquireIsolatedClient(symbol string, snapshot int, clients map[string]*Client, refs map[string]int) (*Client, error) {
	normSymbol, err := normalizeSymbol(symbol)
	if err != nil {
		return nil, err
	}

	c.snapshotMu.Lock()
	defer c.snapshotMu.Unlock()
	if c.State() == StateClosed {
		return nil, fmt.Errorf("gemini websocket: websocket client is closed")
	}

	snapshotClient := clients[normSymbol]
	if snapshotClient == nil {
		snapshotClient = NewPublicClient(
			c.url,
			WithDialer(c.dialer),
			WithClientLogger(c.logger),
			WithHeaders(c.headers),
			WithAutoReconnect(c.autoReconnect),
			WithMaxReconnects(c.maxReconnects),
			WithSnapshot(snapshot),
		)
		snapshotClient.maxMessageSize = c.maxMessageSize
		snapshotClient.livenessInterval = c.livenessInterval
		snapshotClient.livenessTimeout = c.livenessTimeout
		clients[normSymbol] = snapshotClient
	}
	refs[normSymbol]++
	return snapshotClient, nil
}

func (c *Client) releaseIsolatedSnapshotClient(symbol string, snapshotClient *Client) {
	c.releaseIsolatedClient(symbol, snapshotClient, c.snapshotClients, c.snapshotClientRefs)
}

func (c *Client) releaseIsolatedPartialSnapshotClient(symbol string, snapshotClient *Client) {
	c.releaseIsolatedClient(symbol, snapshotClient, c.partialSnapshotClients, c.partialSnapshotRefs)
}

func (c *Client) releaseIsolatedClient(symbol string, snapshotClient *Client, clients map[string]*Client, refs map[string]int) {
	normSymbol, err := normalizeSymbol(symbol)
	if err != nil {
		return
	}
	c.snapshotMu.Lock()
	if clients[normSymbol] != snapshotClient {
		c.snapshotMu.Unlock()
		return
	}
	if refs[normSymbol] > 1 {
		refs[normSymbol]--
		c.snapshotMu.Unlock()
		return
	}
	delete(refs, normSymbol)
	delete(clients, normSymbol)
	c.snapshotMu.Unlock()
	_ = snapshotClient.Close()
}

func (c *Client) subscribeIsolatedDepth(ctx context.Context, symbol, suffix string) (<-chan *DepthUpdate, error) {
	snapshotClient, err := c.acquireIsolatedSnapshotClient(symbol)
	if err != nil {
		return nil, err
	}
	depth, err := subscribePublicFeed(
		ctx,
		snapshotClient,
		symbol,
		"depth",
		suffix,
		256,
		func(t *subTables) map[string][]*subscription[DepthUpdate] { return t.depthSubs },
		func(t *subTables, m map[string][]*subscription[DepthUpdate]) { t.depthSubs = m },
	)
	if err != nil {
		c.releaseIsolatedSnapshotClient(symbol, snapshotClient)
		return nil, err
	}
	return depth, nil
}

func (c *Client) unsubscribeIsolatedDepth(ctx context.Context, symbol, suffix string) error {
	snapshotClient, err := c.removeIsolatedClientForVariant(
		symbol,
		c.snapshotClients,
		c.snapshotClientRefs,
		"depth",
		suffix,
	)
	if err != nil {
		return err
	}
	if snapshotClient == nil {
		return nil
	}
	err = unsubscribePublicFeed(
		ctx,
		snapshotClient,
		symbol,
		"depth",
		suffix,
		func(t *subTables) map[string][]*subscription[DepthUpdate] { return t.depthSubs },
		func(t *subTables, m map[string][]*subscription[DepthUpdate]) { t.depthSubs = m },
	)
	closeErr := snapshotClient.Close()
	return errors.Join(err, closeErr)
}

func (c *Client) subscribeIsolatedPartialDepth(ctx context.Context, symbol string, options PartialDepthSubscriptionOptions) (<-chan *OrderBookSnapshot, error) {
	snapshotClient, err := c.acquireIsolatedPartialSnapshotClient(symbol)
	if err != nil {
		return nil, err
	}
	suffix, err := partialDepthStreamSuffix(options)
	if err != nil {
		c.releaseIsolatedPartialSnapshotClient(symbol, snapshotClient)
		return nil, err
	}
	depth, err := subscribePublicFeed(
		ctx,
		snapshotClient,
		symbol,
		"partialDepth",
		suffix,
		256,
		func(t *subTables) map[string][]*subscription[OrderBookSnapshot] { return t.partialDepthSubs },
		func(t *subTables, m map[string][]*subscription[OrderBookSnapshot]) { t.partialDepthSubs = m },
	)
	if err != nil {
		c.releaseIsolatedPartialSnapshotClient(symbol, snapshotClient)
		return nil, err
	}
	return depth, nil
}

func (c *Client) unsubscribeIsolatedPartialDepth(ctx context.Context, symbol string, options PartialDepthSubscriptionOptions) error {
	suffix, err := partialDepthStreamSuffix(options)
	if err != nil {
		return err
	}
	snapshotClient, err := c.removeIsolatedClientForVariant(
		symbol,
		c.partialSnapshotClients,
		c.partialSnapshotRefs,
		"partialDepth",
		suffix,
	)
	if err != nil {
		return err
	}
	if snapshotClient == nil {
		return nil
	}
	err = unsubscribePublicFeed(
		ctx,
		snapshotClient,
		symbol,
		"partialDepth",
		suffix,
		func(t *subTables) map[string][]*subscription[OrderBookSnapshot] { return t.partialDepthSubs },
		func(t *subTables, m map[string][]*subscription[OrderBookSnapshot]) { t.partialDepthSubs = m },
	)
	closeErr := snapshotClient.Close()
	return errors.Join(err, closeErr)
}

func (c *Client) removeIsolatedClientForVariant(symbol string, clients map[string]*Client, refs map[string]int, feedPrefix, suffix string) (*Client, error) {
	normSymbol, err := normalizeSymbol(symbol)
	if err != nil {
		return nil, err
	}
	c.snapshotMu.Lock()
	defer c.snapshotMu.Unlock()
	snapshotClient := clients[normSymbol]
	if snapshotClient == nil {
		return nil, nil
	}

	snapshotClient.subsMu.Lock()
	feedKey := fmt.Sprintf("%s:%s@%s", feedPrefix, normSymbol, suffix)
	err = validateActiveSubscriptionVariantLocked(snapshotClient, feedKey, suffix)
	snapshotClient.subsMu.Unlock()
	if err != nil {
		return nil, err
	}

	delete(clients, normSymbol)
	delete(refs, normSymbol)
	return snapshotClient, nil
}
