const salon = 'atelier-nova';

Cypress.Commands.add('resetDemo', () => {
  cy.task('seedUiux', null, { timeout: 60000 });
});

Cypress.Commands.add('adminLogin', () => {
  cy.visit('/dashboard.html?salon=' + salon);
  cy.get('#login-email').clear().type('demo@atelier-nova.test');
  cy.get('#pw').clear().type('UIUX2026!');
  cy.contains('button', 'Entrer').click();
  cy.get('#app').should('be.visible');
  cy.get('#app-salon-badge').should('contain', 'Atelier Nova');
});

Cypress.Commands.add('barberLogin', (pin = '4312') => {
  cy.visit('/caisse.html?salon=' + salon);
  pin.split('').forEach((digit) => cy.get('[data-k="' + digit + '"]').click());
  cy.get('#app-screen').should('be.visible');
});

Cypress.Commands.add('clientLogin', () => {
  cy.visit('/compte.html?salon=' + salon);
  cy.get('#li-email').type('lea.dupont@demo.test');
  cy.get('#li-pass').type('Client2026!');
  cy.contains('button', 'Se connecter').click();
  cy.get('#p-home').should('have.class', 'on');
});

beforeEach(() => {
  cy.clearAllSessionStorage();
  cy.clearAllLocalStorage();
});
