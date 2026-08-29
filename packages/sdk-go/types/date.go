package types

import (
	"bytes"
	"encoding/json"
	"fmt"
	"time"
)

// Date represents a YYYY-MM-DD date formatted value in JSON.
type Date struct {
	time.Time
}

func NewDate(t time.Time) Date {
	return Date{Time: t}
}

func (d Date) String() string {
	if d.IsZero() {
		return ""
	}
	return d.Format("2006-01-02")
}

func (d Date) MarshalJSON() ([]byte, error) {
	if d.IsZero() {
		return []byte("null"), nil
	}
	return json.Marshal(d.Format("2006-01-02"))
}

func (d *Date) UnmarshalJSON(data []byte) error {
	data = bytes.TrimSpace(data)
	if bytes.Equal(data, []byte("null")) {
		d.Time = time.Time{}
		return nil
	}
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return fmt.Errorf("gemini types: invalid date: %w", err)
	}
	if s == "" {
		d.Time = time.Time{}
		return nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return err
	}
	d.Time = t
	return nil
}

// UUID represents a string UUID identifier.
type UUID = string

// File represents a binary file download payload.
type File struct {
	Data     []byte
	Filename string
}
