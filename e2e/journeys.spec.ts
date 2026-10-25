import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("customer purchase and admin management use the same database", async ({ browser }) => {
  const adminEmail = process.env.TEST_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL;
  const adminPassword = process.env.TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error("Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD for an existing admin account.");
  }

  const suffix = randomUUID().slice(0, 8);
  const make = `E2E${suffix}`;
  const model = "Test Sedan";
  const editedModel = "Test Sedan Plus";
  const customerEmail = `e2e-${suffix}@example.test`;
  const customerPassword = "BrowserTest123!";

  const adminContext = await browser.newContext();
  const customerContext = await browser.newContext();
  try {
    const admin = await adminContext.newPage();
    await admin.goto("/");
    await admin.getByLabel("Email").fill(adminEmail);
    await admin.getByLabel("Password").fill(adminPassword);
    await admin.locator("form").getByRole("button", { name: "Sign in" }).click();
    await expect(admin.getByRole("heading", { name: "Manage inventory" })).toBeVisible();

    await admin.getByRole("button", { name: "Add vehicle" }).click();
    const createDialog = admin.getByRole("dialog", { name: "Add vehicle" });
    await createDialog.getByLabel("Make").fill(make);
    await createDialog.getByLabel("Model").fill(model);
    await createDialog.getByLabel("Category").fill("Sedan");
    await createDialog.getByLabel("Price").fill("1250000.00");
    await createDialog.getByLabel("Quantity").fill("1");
    await createDialog.getByRole("button", { name: "Create vehicle" }).click();
    await expect(admin.getByRole("article", { name: `${make} ${model}` })).toBeVisible();

    const customer = await customerContext.newPage();
    await customer.goto("/");
    await customer.getByRole("button", { name: "Register" }).first().click();
    await customer.getByLabel("Name").fill("Browser Tester");
    await customer.getByLabel("Email").fill(customerEmail);
    await customer.getByLabel("Password").fill(customerPassword);
    await customer.locator("form").getByRole("button", { name: "Register" }).click();
    await expect(customer.getByText("Account created. Sign in to continue.")).toBeVisible();
    await customer.getByLabel("Password").fill(customerPassword);
    await customer.locator("form").getByRole("button", { name: "Sign in" }).click();
    await expect(customer.getByRole("heading", { name: "Explore inventory" })).toBeVisible();

    await customer.getByLabel("Make").fill(make);
    await customer.getByRole("checkbox", { name: "In stock" }).check();
    await customer.getByRole("button", { name: "Search" }).click();
    const customerCard = customer.getByRole("article").filter({ hasText: model });
    await expect(customerCard).toBeVisible();
    await customerCard.getByRole("button", { name: "Purchase" }).click();
    await expect(customer.getByRole("heading", { name: "No vehicles found" })).toBeVisible();
    await expect(customer.getByText(`${make} ${model} purchased. Inventory updated.`)).toBeVisible();

    await admin.getByRole("button", { name: "Browse inventory" }).click();
    await expect(admin.getByRole("heading", { name: "Explore inventory" })).toBeVisible();
    await admin.getByRole("button", { name: "Manage inventory" }).click();
    let adminCard = admin.getByRole("article", { name: `${make} ${model}` });
    await expect(adminCard.getByText("Out of stock")).toBeVisible();

    await adminCard.getByRole("button", { name: `Edit ${make} ${model}` }).click();
    const editDialog = admin.getByRole("dialog", { name: "Edit vehicle" });
    await editDialog.getByLabel("Model").fill(editedModel);
    await editDialog.getByLabel("Price").fill("1350000.00");
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    adminCard = admin.getByRole("article", { name: `${make} ${editedModel}` });
    await expect(adminCard).toBeVisible();
    await expect(adminCard.getByText("₹13,50,000.00")).toBeVisible();

    await adminCard.getByRole("button", { name: `Restock ${make} ${editedModel}` }).click();
    const restockDialog = admin.getByRole("dialog", { name: `Restock ${make} ${editedModel}` });
    await restockDialog.getByLabel("Units to add").fill("2");
    await restockDialog.getByRole("button", { name: "Add stock" }).click();
    await expect(adminCard.getByText("2 available")).toBeVisible();

    await adminCard.getByRole("button", { name: `Delete ${make} ${editedModel}` }).click();
    const deleteDialog = admin.getByRole("dialog", { name: `Delete ${make} ${editedModel}?` });
    await deleteDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(adminCard).toBeVisible();
    await adminCard.getByRole("button", { name: `Delete ${make} ${editedModel}` }).click();
    await admin.getByRole("dialog", { name: `Delete ${make} ${editedModel}?` }).getByRole("button", { name: "Confirm delete" }).click();
    await expect(adminCard).toHaveCount(0);
  } finally {
    await customerContext.close();
    await adminContext.close();
  }
});
