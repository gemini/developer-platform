module github.com/gemini/gemini-go/cmd/demo

go 1.23.0

replace github.com/gemini/gemini-go => ../..

replace github.com/gemini/gemini-go/websocket/gorilla => ../../websocket/gorilla

require (
	github.com/gemini/gemini-go v0.1.0
	github.com/gemini/gemini-go/websocket/gorilla v0.1.0
)

require github.com/gorilla/websocket v1.5.3 // indirect
