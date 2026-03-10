# Contributing to BlockItAll

Thanks for your interest in contributing! This project is community-powered and open source.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Follow the setup instructions in the [README](./README.md)
4. Create a feature branch from `main`
5. Make your changes
6. Submit a pull request

## Project Structure

```
/packages
  /admin-dashboard    - React admin app (Netlify)
  /landing-page       - Public landing page (Netlify)
  /browser-extension  - Chrome/Firefox MV3 extension
  /crawler            - Automated bot detection
  /shared             - Shared types and utilities
/supabase
  /migrations         - SQL migration files
  /functions          - Supabase Edge Functions
  /seed               - Development seed data
/docs                 - Documentation
```

## Development Guidelines

- Every database change must be a migration file in `/supabase/migrations/`
- Keep the browser extension code clean and well-commented — users will audit it
- Never send Twitter session tokens or cookies to any server
- Write tests for critical paths
- Use TypeScript wherever possible

## Security

This project handles sensitive user data (Twitter session tokens). Security is paramount:

- Session tokens must NEVER leave the user's browser
- All Supabase RLS policies must be tested
- Sanitize all user inputs
- If you find a security issue, please report it privately via email before opening a public issue

## Code Style

- Use TypeScript
- Use functional components in React
- Prefer `const` over `let`
- Use meaningful variable names
- Add comments for non-obvious logic

## Submitting Changes

1. Ensure your code follows the style guidelines
2. Test your changes locally
3. Write a clear PR description explaining what and why
4. Reference any related issues

## Reporting Issues

- Use GitHub Issues
- Include steps to reproduce
- Include browser/OS version for extension issues
- Never include session tokens or credentials in bug reports
