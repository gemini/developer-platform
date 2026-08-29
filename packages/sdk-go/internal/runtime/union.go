package runtime

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

// JSONMerge merges JSON object b on top of JSON object a.
func JSONMerge(a []byte, b []byte) ([]byte, error) {
	if len(a) == 0 || bytes.Equal(a, []byte("null")) {
		return b, nil
	}
	if len(b) == 0 || bytes.Equal(b, []byte("null")) {
		return a, nil
	}
	left, err := decodeJSONValue(a)
	if err != nil {
		return nil, err
	}
	right, err := decodeJSONValue(b)
	if err != nil {
		return nil, err
	}
	leftMap, leftOK := left.(map[string]any)
	rightMap, rightOK := right.(map[string]any)
	if !leftOK || !rightOK {
		// Union branches are occasionally scalar values. The later branch still
		// has precedence, just as object members from b do.
		return b, nil
	}
	for k, v := range rightMap {
		leftMap[k] = v
	}
	return json.Marshal(leftMap)
}

func decodeJSONValue(value []byte) (any, error) {
	decoder := json.NewDecoder(bytes.NewReader(value))
	decoder.UseNumber()

	var decoded any
	if err := decoder.Decode(&decoded); err != nil {
		return nil, err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("json merge: multiple JSON values")
		}
		return nil, err
	}
	return decoded, nil
}
