# Phase 1 Supplier Creation QA

Drive `/app/suppliers` as the seeded admin user.

1. Capture the suppliers page.
2. Open the add supplier dialog.
3. Capture empty-form validation behaviour.
4. Capture one-character-name validation.
5. Create `QA_RUN.supplier`.
6. Verify the detail page round-trips the entered fields.
7. Add one route and one suite type.
8. Confirm `suppliers`, `supplier_emails`, `routes`, and `suite_types` rows in the database.
9. Persist supplier `id` and `slug` to `qa/.run-state.json`.
10. Record console errors and network 4xx/5xx responses.
