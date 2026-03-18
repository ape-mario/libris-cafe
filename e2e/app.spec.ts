import { test, expect } from '@playwright/test';

// Helper: create a profile and land on library
async function setupProfile(page: import('@playwright/test').Page, name = 'Tester') {
  await page.goto('/');
  // Should see profile picker
  await expect(page.locator('text=Add Profile')).toBeVisible({ timeout: 10000 });
  // Create profile
  await page.click('text=Add Profile');
  await page.fill('input[placeholder]', name);
  await page.click('button[type="submit"]');
  // Should land on library page
  await expect(page.locator('h1')).toContainText(/Library|Koleksi/);
}

test.describe('Profile Switching', () => {
  test('should create a profile and see library', async ({ page }) => {
    await setupProfile(page);
    // Verify we're on the library page
    await expect(page.locator('h1')).toBeVisible();
  });

  test('should switch back to profile picker', async ({ page }) => {
    await setupProfile(page);
    // Click profile button in top bar to switch
    await page.click('header button');
    // Should see profile picker again
    await expect(page.locator('text=Add Profile')).toBeVisible();
  });

  test('should persist profile across reload', async ({ page }) => {
    await setupProfile(page, 'Alice');
    await page.reload();
    // Should still be on library, not profile picker
    await expect(page.locator('h1')).toContainText(/Library|Koleksi/);
  });
});

test.describe('Add Book (Manual)', () => {
  test('should add a book manually and see it in library', async ({ page }) => {
    await setupProfile(page);

    // Navigate to add page
    await page.click('text=+ Add Book');
    await expect(page.locator('h1')).toContainText(/Add Book|Tambah Buku/);

    // Switch to manual mode
    await page.click('button:has-text("Manual")');

    // Fill in book details
    await page.fill('input:below(:text("Title"))', 'Test Book');
    await page.fill('input:below(:text("Authors"))', 'Test Author');
    await page.fill('input:below(:text("Categories"))', 'fiction, test');

    // Submit
    await page.click('button[type="submit"]');

    // Should navigate back to library
    await expect(page.locator('h1')).toContainText(/Library|Koleksi/);

    // Book should appear (use first() since BookCard shows title in two places)
    await expect(page.locator('text=Test Book').first()).toBeVisible();
  });

  test('should show error when title is empty', async ({ page }) => {
    await setupProfile(page);
    await page.click('text=+ Add Book');
    await page.click('button:has-text("Manual")');

    // Try to submit without title
    await page.click('button[type="submit"]');

    // Should show error
    await expect(page.locator('.text-berry')).toBeVisible();
  });
});

test.describe('Book Detail & Edit', () => {
  test('should view and edit book details', async ({ page }) => {
    await setupProfile(page);

    // Add a book first
    await page.click('text=+ Add Book');
    await page.click('button:has-text("Manual")');
    await page.fill('input:below(:text("Title"))', 'Edit Me');
    await page.fill('input:below(:text("Authors"))', 'Some Author');
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toContainText(/Library|Koleksi/);

    // Click on the book
    await page.click('text=Edit Me');

    // Should see book detail
    await expect(page.locator('h1:has-text("Edit Me")')).toBeVisible();

    // Click edit button (pencil icon)
    await page.click('button[aria-label*="Edit"]');

    // Should see edit form
    await expect(page.locator('text=Save Changes')).toBeVisible();

    // Change title
    const titleInput = page.locator('input').first();
    await titleInput.clear();
    await titleInput.fill('Edited Book');

    // Save
    await page.click('text=Save Changes');

    // Should see updated title
    await expect(page.locator('h1:has-text("Edited Book")')).toBeVisible();
  });

  test('should set reading status', async ({ page }) => {
    await setupProfile(page);

    // Add a book
    await page.click('text=+ Add Book');
    await page.click('button:has-text("Manual")');
    await page.fill('input:below(:text("Title"))', 'Status Book');
    await page.fill('input:below(:text("Authors"))', 'Author');
    await page.click('button[type="submit"]');

    // Open book detail
    await page.click('text=Status Book');

    // Click "Reading" status
    await page.click('button:has-text("Reading")');

    // Progress section should appear
    await expect(page.locator('text=Progress')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Search', () => {
  test('should filter books by search query', async ({ page }) => {
    await setupProfile(page);

    // Add two books
    await page.click('text=+ Add Book');
    await page.click('button:has-text("Manual")');
    await page.fill('input:below(:text("Title"))', 'Alpha Book');
    await page.fill('input:below(:text("Authors"))', 'Writer A');
    await page.click('button[type="submit"]');

    await page.click('text=+ Add Book');
    await page.click('button:has-text("Manual")');
    await page.fill('input:below(:text("Title"))', 'Beta Book');
    await page.fill('input:below(:text("Authors"))', 'Writer B');
    await page.click('button[type="submit"]');

    // Both books should be visible
    await expect(page.locator('text=Alpha Book').first()).toBeVisible();
    await expect(page.locator('text=Beta Book').first()).toBeVisible();

    // Search for "Alpha"
    await page.fill('input[type="search"]', 'Alpha');

    // Wait for debounce
    await page.waitForTimeout(300);

    // Only Alpha should be visible
    await expect(page.locator('text=Alpha Book').first()).toBeVisible();
    await expect(page.locator('text=Beta Book').first()).not.toBeVisible();

    // Clear search
    await page.fill('input[type="search"]', '');
    await page.waitForTimeout(300);

    // Both should be visible again
    await expect(page.locator('text=Alpha Book').first()).toBeVisible();
    await expect(page.locator('text=Beta Book').first()).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test('should navigate between tabs', async ({ page }) => {
    await setupProfile(page);

    // Browse tab
    await page.click('a[href="/browse"]');
    await expect(page.locator('h1')).toContainText(/Browse|Jelajahi/);

    // Mine tab
    await page.click('a[href="/mine"]');
    await expect(page.locator('h1')).toContainText(/My Books|Buku Saya/);

    // Back to Library
    await page.click('a[href="/"]');
    await expect(page.locator('h1')).toContainText(/Library|Koleksi/);
  });

  test('should access settings', async ({ page }) => {
    await setupProfile(page);
    await page.click('a[href="/settings"]');
    await expect(page.locator('h1')).toContainText(/Settings|Pengaturan/);
  });

  test('should access stats from bottom nav', async ({ page }) => {
    await setupProfile(page);
    await page.click('nav a[href="/stats"]');
    await expect(page.locator('h1')).toContainText(/Reading Stats|Statistik/);
  });

  test('should access shelves from bottom nav', async ({ page }) => {
    await setupProfile(page);
    await page.click('nav a[href="/shelves"]');
    await expect(page.locator('h1')).toContainText(/Shelves|Rak/);
  });
});
