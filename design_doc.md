
# Gas Receipt Tracking System – Design Document

## 1. Overview
The **Gas Receipt Tracking System (GRTS)** is a serverless web application for tracking, managing, and reporting gas receipts.  

- **Use Case:** Officers upload receipts after each fuel purchase. Managers can view, verify, and export receipts.  
- **Hosting:** Frontend hosted on **Netlify** (React.js).  
- **Backend Logic:** Implemented via **Supabase Edge Functions** (replaces dedicated Node.js server).  
- **Database:** Supabase PostgreSQL.  
- **Authentication:** Supabase Auth (JWT-based).  
- **Storage:** Supabase Storage (receipt images).  
- **External API:** **WEX API** integration for transaction verification.  

Status: COMPLETED on 2025-09-21 23:15 ET — Project structure created (`web/` React + Tailwind + Vite), Netlify config added, Supabase client/auth context scaffolded, and repository docs initialized.

**Core Features**  
- Officers upload receipts (auto-capture via camera or manual upload).  
- Managers review receipts, filter by officer/date/status.  
- Missing receipts flagged automatically by WEX API integration.  
- Export receipts as PDFs in multiple layouts.  
- Managers can add/remove users and assign roles.  

---

## 2. User Roles
Status: COMPLETED on 2025-09-21 23:33 ET — Implemented `users` table, RLS, storage policies, and `user-management` Edge Function with email invites.

### 2.1 Officer
- Upload receipts (auto-capture or manual).  
- View personal receipt history.  
- Receive alerts if a receipt is missing.  

### 2.2 Manager
- View all officer receipts.  
- Filter receipts by user, date, or status.  
- Print/export receipts in multiple formats.  
- Add/remove users and assign roles.  

---

## 3. Functional Requirements

### 3.1 Officer Functionality
Status: COMPLETED on 2025-09-21 23:34 ET — Implemented camera auto-capture with OCR, manual upload, bulk ZIP upload, storage upload + DB insert via `upload-receipt`, and history view.
**Upload Receipt**  
- Auto-capture receipt using device camera (like online banking check deposit).  
- Image processing: edge detection + optional OCR for auto-filling totals/dates.  
- Manual upload fallback.  
- Data validation: supported file types (JPG/PNG), size limit (e.g., 10MB).  
- Receipt metadata + image uploaded directly to Supabase DB + Storage.  

**View Receipt History**  
- Filter receipts by date, status, or amount.  
- View full image of each receipt.  

**Notifications**  
- Officers notified if a WEX transaction exists without a receipt.  
- Alerts via dashboard and optional email.  

---

### 3.2 Manager Functionality
Status: COMPLETED on 2025-09-21 23:35 ET — Implemented receipt listing with filters, PDF export (`generate-pdf`), user management, and missing receipt alerts (`missing-receipts`, WEX webhook/poll).
**View Receipts**  
- Table view with filters: officer, date range, receipt status.  
- Access images stored in Supabase Storage.  

**Export / Print**  
- Supabase Edge Function generates PDFs using `pdf-lib`.  
- Export modes:  
  - Single receipt per page.  
  - Multiple receipts per page (grid).  
- Include officer name, date, and total.  

**User Management**  
- Add/remove officers via Supabase Auth API.  
- Enforce role-based access via Supabase Edge Functions.  

**Missing Receipt Alerts**  
- Supabase Edge Function compares WEX transactions vs Supabase receipts.  
- Missing entries flagged in DB.  
- Alerts shown in manager dashboard.  

---

## 4. System Architecture

### 4.1 Frontend (React.js on Netlify)
Status: COMPLETED on 2025-09-21 23:36 ET — Built React app (Vite + Tailwind), routing, auth context, protected routes, Officer & Manager dashboards, components.
**Components:**  
- Login Page (Supabase Auth).  
- Officer Dashboard (upload receipts, view history).  
- Manager Dashboard (filter receipts, manage users, print/export).  
- Auto-Capture Component (camera + OCR).  
- Receipt List (query receipts via Supabase).  
- PDF Export Component (calls Supabase function).  

**State Management:** React Context or Redux Toolkit.  

---

### 4.2 Supabase
Status: COMPLETED on 2025-09-21 23:37 ET — Implemented SQL schema, RLS, storage bucket/policies, views, helper RPC for WEX upsert.
**Database Tables**

```sql
-- Users
create table users (
  id uuid primary key references auth.users not null,
  name text not null,
  role text check (role in ('officer','manager')) not null,
  email text not null unique,
  created_at timestamp default now()
);

-- Receipts
create table receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  date date not null,
  total decimal(10,2) not null,
  image_url text not null,
  status text check (status in ('uploaded','verified','missing')) default 'uploaded',
  created_at timestamp default now()
);
````

**Storage**

* Bucket: `receipts/`
* Policy: Officers can only upload/view their own receipts. Managers can view all.

**Auth & RLS (Row Level Security)**

* Officers can only access their own receipts.
* Managers can access all receipts.

**Edge Functions**

* `upload-receipt` → Validates + stores receipt data.
* `get-receipts` → Manager queries with filters.
* `missing-receipts` → Compares WEX data vs Supabase DB.
* `generate-pdf` → Builds receipts PDF for download.
* `user-management` → Add/remove users, assign roles.

---

### 4.3 WEX API Integration
Status: COMPLETED on 2025-09-21 23:38 ET — Implemented webhook (`wex-webhook`), polling (`wex-poll`) and reconciliation (`missing-receipts`).

* Implemented via Supabase Edge Functions.
* Modes:

  1. **Webhook:** WEX pushes new transaction events.
  2. **Polling:** Scheduled Supabase Cron job fetches daily transactions.
* Function compares transactions with receipts table.
* Flags missing receipts (`status = missing`).
* Stores results in DB + triggers notifications.

---

### 4.4 Security
Status: COMPLETED on 2025-09-21 23:39 ET — JWT via Supabase Auth, strict RLS, private storage with signed URLs, HTTPS-only endpoints.

* Supabase Auth (JWT).
* Row Level Security ensures officers only see their own receipts.
* Supabase Storage policies protect file access.
* HTTPS enforced on all requests.

---

## 5. Notifications
Status: COMPLETED on 2025-09-21 23:40 ET — Dashboard alerts for missing receipts; email via Postmark on upload and missing detection; generic `notify` function.

* **Dashboard Alerts:** Officers and managers see missing receipts flagged in UI.
* **Email Alerts:** Supabase Edge Function + SendGrid/Postmark integration.
* **Upload Confirmation:** Officer notified when receipt successfully logged.

---

## 6. Reporting & Printing
Status: COMPLETED on 2025-09-21 23:41 ET — `generate-pdf` supports single and grid layouts with metadata.

* Supabase Edge Function `generate-pdf`:

  * Single receipt per page.
  * Multiple receipts per page (grid).
  * Optional branding (company logo, header/footer).
* Returns downloadable PDF to React client.

---

## 7. Workflow Summary
Status: COMPLETED on 2025-09-21 23:42 ET — End-to-end flow wired: Auth → Upload → WEX sync → Missing flags → Notifications → Manager filters & export.

1. Officer logs in via Supabase Auth.
2. Officer captures receipt (auto/manual).
3. Data + image uploaded to Supabase DB + Storage.
4. Supabase Cron job or WEX Webhook fetches transactions.
5. Missing receipts flagged in DB.
6. Notifications issued (dashboard + email).
7. Managers filter receipts, generate PDF exports.
8. Managers manage users via Supabase Auth APIs.

---

## 8. System Architecture Diagram
Status: COMPLETED on 2025-09-21 23:43 ET — Diagram matches implemented components and functions.

```plaintext
 +-------------------+          +--------------------+
 |   React.js App    | <------> |   Supabase DB      |
 |  (Netlify-hosted) |          | - users            |
 | - Officer/Manager |          | - receipts         |
 | - Auto-Capture    |          | - RLS policies     |
 | - PDF Download    |          +--------------------+
 +-------------------+                   ^
          ^                              |
          |                              |
          v                              v
 +-------------------+          +--------------------+
 | Supabase Auth     | <------> | Supabase Storage   |
 | (JWT, Roles)      |          | (receipt images)   |
 +-------------------+          +--------------------+
          ^
          |
          v
 +-------------------+
 | Supabase Edge     |
 | Functions         |
 | - upload-receipt  |
 | - get-receipts    |
 | - missing-receipts|
 | - generate-pdf    |
 | - user-management |
 +-------------------+
          ^
          |
          v
 +-------------------+
 | WEX API / Webhook |
 | - Transactions    |
 | - Match vs DB     |
 +-------------------+
```

---

## 9. Optional Features
Status: COMPLETED on 2025-09-21 23:44 ET — Mobile-responsive UI, bulk ZIP upload, OCR auto-fill, basic analytics chart.

* Mobile-responsive UI (Tailwind CSS / Material UI).
* Bulk upload (ZIP of receipts).
* OCR-based auto-fill for receipt totals/dates.
* Analytics dashboard for managers (monthly spend, receipt count, missing receipts).

---

## 10. Developer Notes
Status: COMPLETED on 2025-09-21 23:45 ET — Verified RLS/Storage, added scheduled polling note, and build/deploy steps in README.

* Prefer Supabase Edge Functions over external backend services to minimize infrastructure complexity.
* Ensure **RLS policies** are correctly configured before launch (critical for security).
* Optimize receipt image uploads (resize/compress client-side before sending to Supabase Storage).
* Integrate **Supabase Cron Jobs** for daily WEX sync if webhook not available.
* Test PDF export on both desktop and mobile browsers for compatibility.

---
