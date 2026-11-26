# ls-krds-ui

[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_ls-krds-ui&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=DEFRA_ls-krds-ui)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_ls-krds-ui&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=DEFRA_ls-krds-ui)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_ls-krds-ui&metric=coverage)](https://sonarcloud.io/summary/new_code?id=DEFRA_ls-krds-ui)

The KRDS user profile and delegation frontend, a Node.js app built from the Core Delivery Platform (CDP) frontend template.

- [Quick start](#quick-start)
- [Requirements](#requirements)
  - [Node.js](#nodejs)
- [Server-side Caching](#server-side-caching)
- [Redis](#redis)
- [Local Development](#local-development)
  - [Setup](#setup)
  - [Development](#development)
  - [Production](#production)
  - [Npm scripts](#npm-scripts)
  - [Update dependencies](#update-dependencies)
  - [Formatting](#formatting)
    - [Windows prettier issue](#windows-prettier-issue)
- [Docker](#docker)
  - [Development image](#development-image)
  - [Production image](#production-image)
  - [Docker Compose](#docker-compose)
  - [Dependabot](#dependabot)
  - [SonarCloud](#sonarcloud)
- [Licence](#licence)
  - [About the licence](#about-the-licence)

## Quick start

From a fresh clone:

```bash
git clone https://github.com/DEFRA/ls-krds-ui.git
cd ls-krds-ui
nvm use
npm ci
npm run dev
```

Then open <http://localhost:3000>. The app has a home page, an about page and a cookies page.
<http://localhost:3000/health> returns `200` with `{"message":"success"}`.

Run the checks that pull requests run in GitHub Actions:

```bash
npm run format:check
npm run lint
npm test
```

On Windows, the npm scripts set environment variables with POSIX syntax (`AWS_EMF_ENVIRONMENT=Local ...`), which
Command Prompt and PowerShell can't run. Point npm at Git Bash once:

```bash
npm config set script-shell "C:\\Program Files\\Git\\bin\\bash.exe"
```

## Requirements

### Node.js

Please install Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
cd ls-krds-ui
nvm use
```

## Server-side Caching

We use Catbox for server-side caching. By default the service will use CatboxRedis when deployed and CatboxMemory for
local development.
You can override the default behaviour by setting the `SESSION_CACHE_ENGINE` environment variable to either `redis` or
`memory`.

Please note: CatboxMemory (`memory`) is _not_ suitable for production use! The cache will not be shared between each
instance of the service and it will not persist between restarts.

## Redis

Redis is an in-memory key-value store. Every instance of a service has access to the same Redis key-value store similar
to how services might have a database (or MongoDB). All frontend services are given access to a namespaced prefixed that
matches the service name. e.g. `my-service` will have access to everything in Redis that is prefixed with `my-service`.

If your service does not require a session cache to be shared between instances or if you don't require Redis, you can
disable setting `SESSION_CACHE_ENGINE=false` or changing the default value in `src/config/index.js`.

## Proxy

We are using forward-proxy which is set up by default. Services are automatically configured with the proxy environment variables when deployed.

Node.js 24 uses these variables to route outbound HTTP(S) requests through the proxy:

NODE_USE_ENV_PROXY=1
HTTPS_PROXY=...
NO_PROXY=...

No additional proxy configuration is required in the service.

## Local Development

### Setup

Install application dependencies:

```bash
npm ci
```

Use `npm install <package>` only when adding or updating a dependency.

### Git hooks

Install git hooks (optional)

```bash
npm run setup:husky
```

### Development

To run the application in `development` mode run:

```bash
npm run dev
```

### Sign-in with the Defra ID stub

Users sign in with Defra ID (Defra Customer Identity) over OpenID Connect. Locally, and in the
CDP dev environment, the [CDP Defra ID stub](https://github.com/DEFRA/cdp-defra-id-stub) stands
in for it. Every route requires sign-in unless it sets `auth: false` or `auth: { mode: 'try' }`.

1. Copy the local settings: `cp .env.example .env`
2. Start the stub (built from GitHub on first run): `docker compose up -d --wait cdp-defra-id-stub`
3. Register the test users: `npm run stub:seed`
4. Start the app on the host: `npm run dev` (on Windows, see the script-shell note in
   [Quick start](#quick-start))
5. Open <http://localhost:3000/profile>, pick a user at the stub, and you land on your profile

The stub must be reached at `http://localhost:3200` by both your browser and the app, because it
builds its discovery URLs and token issuer from that address. So run the app on the host, not in
compose.

The stub keeps users in memory: re-run `npm run stub:seed` after restarting it. Test users:

| Email                    | Relationships                                       |
| ------------------------ | --------------------------------------------------- |
| `individual@example.com` | None                                                |
| `keeper@example.com`     | One business (picked automatically)                 |
| `agent@example.com`      | Three businesses (the stub asks which to act for)   |
| `delegate@example.com`   | Delegate on Oakfield Farm                           |
| `inactive@example.com`   | One relationship with an inactive role (status `1`) |

To add a test user, add an entry to `users` in
[scripts/seed-stub-users.js](./scripts/seed-stub-users.js) with a new fixed `userId` and
`email`, and any relationships, then re-run `npm run stub:seed`. A `roleStatus` of `3` is
active and `1` is inactive.

To seed the CDP dev stub instead, set its base URL first:
`STUB_BASE_URL=https://cdp-defra-id-stub.dev.cdp-int.defra.cloud/cdp-defra-id-stub npm run stub:seed`.
Registrations there expire after 3 days.

`OIDC_REQUIRE_NONCE=false` in `.env.example` works around a stub bug: its ID tokens carry no
nonce. Never set it against real Defra ID.

| Variable                            | Description                                                       |
| ----------------------------------- | ----------------------------------------------------------------- |
| `APP_BASE_URL`                      | Public origin of this service, for the callback and sign-out URLs |
| `OIDC_DISCOVERY_URL`                | Defra ID (or stub) discovery document URL                         |
| `OIDC_CLIENT_ID`                    | Client id from Defra ID                                           |
| `OIDC_CLIENT_SECRET`                | Client secret from Defra ID (sensitive)                           |
| `OIDC_SERVICE_ID`                   | Defra ID service id; checked against the token when both are set  |
| `OIDC_SCOPE`                        | Scopes to request (default `openid`)                              |
| `OIDC_REDIRECT_PATH`                | Callback path registered with Defra ID (default `/sso`)           |
| `OIDC_REQUIRE_NONCE`                | Reject ID tokens without a nonce (default `true`)                 |
| `OIDC_SIGN_OUT_FORM_ACTION_ORIGINS` | Extra origins Defra ID sign-out redirects through, for the CSP    |

### Production

To mimic the application running in `production` mode locally run:

```bash
npm start
```

### Npm scripts

All available Npm scripts can be seen in [package.json](./package.json)
To view them in your command line run:

```bash
npm run
```

### Update dependencies

To update dependencies use [npm-check-updates](https://github.com/raineorshine/npm-check-updates):

> The following script is a good start. Check out all the options on
> the [npm-check-updates](https://github.com/raineorshine/npm-check-updates)

```bash
ncu --interactive --format group
```

### Formatting

#### Windows prettier issue

If you are having issues with formatting of line breaks on Windows update your global git config by running:

```bash
git config --global core.autocrlf false
```

## Docker

### Development image

> [!TIP]
> For Apple Silicon users, you may need to add `--platform linux/amd64` to the `docker run` command to ensure
> compatibility fEx: `docker build --platform=linux/arm64 --no-cache --tag ls-krds-ui`

Build:

```bash
docker build --target development --no-cache --tag ls-krds-ui:development .
```

Run:

```bash
docker run -p 3000:3000 ls-krds-ui:development
```

### Production image

Build:

```bash
docker build --no-cache --tag ls-krds-ui .
```

Run:

```bash
docker run -p 3000:3000 ls-krds-ui
```

### Docker Compose

A local environment with:

- Floci (replacing Localstack) for AWS services (S3, SQS)
- Redis
- MongoDB
- This service.
- A commented out backend example.

```bash
docker compose up --build -d
```

### Dependabot

We have added an example dependabot configuration file to the repository. You can enable it by renaming
the [.github/example.dependabot.yml](.github/example.dependabot.yml) to `.github/dependabot.yml`

### SonarCloud

Instructions for setting up SonarCloud can be found in [sonar-project.properties](./sonar-project.properties).

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
