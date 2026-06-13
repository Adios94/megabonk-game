#!/usr/bin/env bash
# Thin wrapper — logic lives in scripts/harness/check-contract.sh
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/scripts/harness/check-contract.sh"
