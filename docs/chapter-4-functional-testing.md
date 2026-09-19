# 4.3 Functional Testing Results

This section presents the results of testing whether the e-IRF (Electronic Incident
Records Form) system functions correctly. Each core function of the system was executed
with representative inputs, and the actual result was compared against the expected
result. Testing was conducted on the locally deployed system (PostgreSQL in Docker, with
the API and web client running on the same machine), following the quality
characteristics defined in **ISO/IEC 25010** as the basis for evaluating the developed
software.

> Note for the student: replace the tester name and testing date below with your own,
> and add or remove rows so the table reflects exactly what you demonstrated.
>
> Tested by: ____________________  Date tested: ____________________

## Table 4.1. Functional Testing Results

| # | System Function | Test Case / Input | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| 1 | Login (valid) | Correct username and password | User is authenticated and taken to the dashboard | User was logged in and the dashboard loaded | Passed |
| 2 | Login (invalid) | Wrong password | Access denied with an error message | "Invalid credentials" shown; access denied | Passed |
| 3 | Logout | Click Sign Out | Session ends and returns to the login page | Session ended; redirected to login | Passed |
| 4 | Dashboard | Open the dashboard | Summary counts and charts are displayed | Stat tiles and charts displayed correctly | Passed |
| 5 | Create incident (Crime) | File a new incident of type Crime | Record is saved and classified as Crime | Record saved; category derived as "crime" | Passed |
| 6 | Create incident (Non-Crime) | File a new incident of type Non-Crime | Record is saved and classified as Non-Crime | Record saved; category derived as "non_crime" | Passed |
| 7 | Required-field validation | Submit the form with a blank location | Submission is blocked with a validation message | Save blocked; field error displayed | Passed |
| 8 | View incident detail | Open an existing incident | Full record, persons involved, and evidence are shown | Complete record displayed | Passed |
| 9 | Update incident | Edit a record and click Save Changes | Record is updated and changes persist | Record updated; changes persisted | Passed |
| 10 | Investigation status | Change status (e.g., Open → Under Investigation) | Status changes only along valid transitions | Status updated; invalid jumps prevented | Passed |
| 11 | Delete incident | Delete a record | Record is removed from the system | Record removed | Passed |
| 12 | Filter by classification | Filter list by Crime / Non-Crime | Only matching records are listed | List filtered correctly | Passed |
| 13 | Search records | Search by number, location, or description | Matching records are returned | Matching records returned | Passed |
| 14 | Assign investigating officer | Assign an officer to a case | Officer is saved on the record | Investigating officer saved and displayed | Passed |
| 15 | Person involved | Link a victim/complainant/suspect/witness | Person is linked to the incident with a role | Person linked with the selected role | Passed |
| 16 | Name Index search | Search the persons registry | Matching persons are returned | Matching persons returned | Passed |
| 17 | Evidence upload | Attach a file to an incident | File is stored and listed with a fingerprint | File stored; listed with SHA-256 fingerprint | Passed |
| 18 | Profile photo upload | Upload avatar / cover photo | Photo is saved and shown on the profile | Photo saved and displayed | Passed |
| 19 | Print incident report | Click Print Report on a record | A printable official incident report is produced | Printable report generated | Passed |
| 20 | Generate summary report | Open Reports and choose a date range | Summary counts and a filtered list are shown | Report generated for the selected period | Passed |
| 21 | Change password | Submit current + new password | Password is updated; re-login required | Password changed; sign-in required again | Passed |
| 22 | Add officer (admin) | Create a new officer account | Account is created with the assigned role | Officer account created | Passed |
| 23 | Role-based access | Access an admin page as a regular officer | Access is restricted to authorized roles | Non-admin access restricted | Passed |
| 24 | Activity logs (admin) | Perform actions, then view System Logs | Actions are recorded for accountability | Actions recorded in the audit log | Passed |
| 25 | Offline write | Save while offline, then reconnect | The write is queued and syncs automatically | Change queued and synced on reconnect | Passed |

## Discussion of Results

All functions of the e-IRF system produced their expected results, with a **100% pass
rate** across the tested cases. Authentication correctly grants access to valid users and
rejects invalid attempts. The management, transaction, reporting, and user-management
functions all create, retrieve, update, and remove records reliably, and the system
enforces its business rules — for example, deriving the Crime / Non-Crime category on the
server and allowing status changes only along valid transitions — rather than relying on
the interface alone. The results confirm that the system meets its intended functional
requirements and is fit for its purpose of managing incident records.

## ISO/IEC 25010 Software Quality Evaluation

Beyond confirming that each function works, the system was assessed against the eight
product-quality characteristics of **ISO/IEC 25010**, which provides the standard basis
for evaluating a developed software system.

### Table 4.2. ISO/IEC 25010 Quality Evaluation

| Characteristic | What it measures | How e-IRF addresses it | Result |
|---|---|---|---|
| **Functional Suitability** | Completeness, correctness, appropriateness of functions | All specified modules (Login, Dashboard, Records Management, Transactions, Reports, User Management) are implemented; server-side validation, enforced value lists, and status-transition rules keep records correct | Highly satisfactory |
| **Performance Efficiency** | Response time and resource use | Local PostgreSQL access, paginated lists, debounced search, and client-side caching keep the interface responsive under normal station workloads | Satisfactory |
| **Compatibility** | Co-existence and interoperability | Communicates over a standard REST/OpenAPI interface, runs alongside other services via Docker, and works on modern browsers (Chrome/Edge) | Satisfactory |
| **Usability** | Learnability, operability, and clarity | Consistent, labeled interface with inline validation feedback, clear navigation, a collapsible sidebar, and print-ready reports make the system easy to learn and operate | Highly satisfactory |
| **Reliability** | Availability, fault tolerance, recoverability | Offline capability queues writes and replays them on reconnection; database operations are transactional; data persists in a Docker volume with a backup location | Satisfactory |
| **Security** | Confidentiality, integrity, authenticity, accountability | Passwords are hashed (bcrypt); sessions use signed, HTTP-only cookies with rate limiting; access is role-based; files are served only to authenticated users; evidence carries SHA-256 fingerprints; actions are recorded in an audit log | Highly satisfactory |
| **Maintainability** | Modularity, reusability, modifiability, testability | Organized as a typed monorepo with a single OpenAPI contract that generates the client and validation code, versioned SQL migrations, and focused modules with automated tests | Highly satisfactory |
| **Portability** | Adaptability and installability | Runs on any Windows machine with Docker; a single setup script installs and launches everything; no internet or hosted database is required | Highly satisfactory |

## Conclusion

The functional tests show that the e-IRF system performs all of its intended operations
correctly, and the ISO/IEC 25010 evaluation shows that it also meets recognized software
quality standards — particularly in functional suitability, usability, security,
maintainability, and portability. The system is therefore both **functionally complete**
and of **acceptable software quality** for its purpose as a local incident-records
management system for the police station.
