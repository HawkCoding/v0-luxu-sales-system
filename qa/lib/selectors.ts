export const selectors = {
  appShell: {
    dashboardHeading: /dashboard|suppliers|bookings|pipeline/i,
  },
  suppliers: {
    pageHeading: "Suppliers",
    addButton: "Add Supplier",
    createButton: "Create Supplier",
    editButton: "Edit",
    savePublishButton: /Save & Publish|Save changes/i,
  },
  packages: {
    pageHeading: "Packages",
    newPackageButton: /New Package/i,
    savePackageButton: /Save package/i,
    saveChangesButton: /^Save$|Save changes/i,
    nextButton: /^Next$/,
  },
}
