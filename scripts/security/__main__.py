"""Entry point for running the DAST probe as a Python module.

Usage:
    python -m scripts.security.run_dast_probe
    python -m scripts.security.run_dast_probe --target http://localhost:9000
    python -m scripts.security.run_dast_probe --ci
"""
from scripts.security.run_dast_probe import main

if __name__ == "__main__":
    main()
