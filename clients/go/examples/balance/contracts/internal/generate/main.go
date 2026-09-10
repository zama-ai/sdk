package main

import (
	"log"
	"os"

	"github.com/ethereum/go-ethereum/accounts/abi/abigen"
)

func main() {
	abi, err := os.ReadFile("confidential_token.abi.json")
	if err != nil {
		log.Fatal(err)
	}
	// The abigen CLI imports node dependencies that do not support Go 1.27.
	code, err := abigen.Bind([]string{"ConfidentialToken"}, []string{string(abi)}, []string{""}, nil, "contracts", nil, nil)
	if err != nil {
		log.Fatal(err)
	}
	if err := os.WriteFile("confidential_token.go", []byte(code), 0o644); err != nil {
		log.Fatal(err)
	}
}
