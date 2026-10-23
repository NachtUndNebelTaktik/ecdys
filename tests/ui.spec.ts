import {test,expect} from '@playwright/test';
test('browser preview never pretends to have desktop privileges',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Your workspace. Your control.'})).toBeVisible();
  await expect(page.getByText('Desktop bridge unavailable')).toBeVisible();
  await expect(page.getByRole('button',{name:'Create encrypted workspace'})).toBeDisabled();
  await expect(page.getByLabel('Workspace passphrase',{exact:true})).toHaveAttribute('type','password');
});
