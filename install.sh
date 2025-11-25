#!/bin/bash
# Railway install script

echo "Installing minimal dependencies..."
pip install --upgrade pip
pip install -r requirements-minimal.txt

echo "Installation complete!"
