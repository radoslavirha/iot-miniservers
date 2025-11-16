# Documentation

## Development

This document describes the process for running these APIs on your local computer.

### Prerequisites

- node.js > 24
- pnpm > 10

### Getting started

Create `.env` and add your PAT for GiHub packages. You'll need to use it before installing like: `NODE_AUTH_TOKEN=XXX pnpm install`

## Docker

### Local build

Create `.npmrc.docker` in root. This is just `.npmrc` with replaced env variable with auth token for private npm packages.

Use following command to build image locally `docker build -t {image}:{tag} --secret id=npmrc,src=.npmrc.docker ./apis/{api}`.

Use following command to run container locally `docker run {image}:{tag}`.

