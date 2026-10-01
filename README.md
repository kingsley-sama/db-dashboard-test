# SupaBase Dashboard Tool

A modern, intuitive dashboard for managing SupaBase databases with a cleaner and more user-friendly experience.

## Features

- **Orders Management**: Complete CRUD operations for orders with advanced filtering and search
- **Product Management**: Dynamic product codes integration with dropdown selections
- **Team Collaboration**: Role-based access control with Owner and Member roles
- **Authentication**: Secure email/password authentication with JWT tokens
- **Real-time Updates**: Automatic data synchronization across the dashboard
- **Intuitive UI**: Clean, professional interface with company branding

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/)
- **Database**: [Supabase](https://supabase.com/) (Postgres)
- **Authentication**: Supabase Auth
- **UI Library**: [shadcn/ui](https://ui.shadcn.com/)
- **Styling**: Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Git installed
- Access to the project repository

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd saas-starter-main
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env.local` file in the root directory with the required variables:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000) to see the application.

## Supplier Invoices

**Dashboard → Invoices** (owners and admins) builds a supplier's invoice for a period and a view type, and downloads it as a PDF. Everything is worked out live from the `orders` table; nothing is saved and no table was added.

- **Billable orders:** the supplier's orders whose `date_first_delivery_complete` falls in the range (both days included). Orders without that date are never billed.
- **View type** comes from `orders.product` — see `PRODUCTS_BY_VIEW_TYPE` in `lib/invoices/categorize.ts`.
- **Price category** is derived automatically in `resolveCategory` (same file): exterior from the proposal's building type (EFH, DHH, MFH-…), then building words in the project name, then a Commercial property type, then SFH; interior from room words in the order comment, then the property type, then Living Areas. Lines decided by a fallback are marked *assumed* on the preview.
- **Prices** live in `PRICE_ROWS` in `lib/invoices/pricing.ts`, in cents. Order total = modelling fee + primary view + (quantity − 1) × additional view. To change a price from a date on, set `effectiveTo` on the current row and add a new row with the new `effectiveFrom`; earlier deliveries keep the old price. A row with `null` prices (Commercial & Mixed-Use today) lists its orders as skipped.
- **Invoice parties** come from environment variables, so no company or supplier details are in the code:

  ```
  INVOICE_COMPANY_NAME=
  INVOICE_COMPANY_ADDRESS=        # lines separated by \n
  INVOICE_COMPANY_TAX_ID=
  INVOICE_COMPANY_EMAIL=
  INVOICE_PAYMENT_TERMS=
  INVOICE_SUPPLIER_DETAILS=       # JSON: {"Studio98": {"legalName": "", "address": "", "taxId": "", "bankDetails": "", "email": ""}}
  ```

The calculation and category rules are unit-tested in `tests/invoice-calculate.test.ts` (`npm test`).

## Contributing

We follow a feature branch workflow. Please follow these steps to contribute to the project:

### 1. Sync with Main Branch

Always start by pulling the latest changes from the main branch:

```bash
git checkout main
git pull origin main
```

### 2. Create a Feature Branch

Create a new branch for your feature or fix using the naming convention `feat/feature-name`:

```bash
git branch feat/your-feature-name
git checkout feat/your-feature-name
```

Or use the shorthand:

```bash
git checkout -b feat/your-feature-name
```

### 3. Install Dependencies

Ensure all dependencies are up to date:

```bash
npm install
```

### 4. Review Current Updates

Check out the current state of the UI and functionality to understand what's already implemented.

### 5. Make Your Changes

- Write clean, readable code
- Follow the existing code style and conventions
- Test your changes thoroughly
- Ensure your code doesn't break existing functionality

### 6. Commit Your Changes

Write clear, descriptive commit messages:

```bash
git add .
git commit -m "feat: add your feature description"
```

### 7. Push to Remote

Push your feature branch to the remote repository:

```bash
git push origin feat/your-feature-name
```

### 8. Create a Pull Request

1. Go to the GitHub repository
2. Click on "Pull Requests"
3. Click "New Pull Request"
4. Select your branch (`feat/your-feature-name`) to merge into `main`
5. Fill in the PR template with:
   - Description of changes
   - Screenshots (if UI changes)
   - Testing steps
   - Any breaking changes

### 9. Code Review

- Your PR will be reviewed by the project maintainer
- Address any requested changes
- Once approved, your changes will be merged into main

## Branch Naming Conventions

- **Features**: `feat/feature-name`
- **Bug Fixes**: `fix/bug-description`
- **Documentation**: `docs/update-description`
- **Refactoring**: `refactor/component-name`

## Commit Message Guidelines

Use conventional commit messages:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Example:
```bash
git commit -m "feat: add product dropdown to order creation form"
git commit -m "fix: resolve uncontrolled input warning in Input component"
```
