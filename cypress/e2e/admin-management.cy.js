describe('Administration avancée', () => {
  beforeEach(() => {
    cy.resetDemo();
    cy.adminLogin();
  });

  it('ajoute un coiffeur à l’équipe du salon', () => {
    cy.get('[data-t="barbers"]').click();
    cy.contains('button', '+ Ajouter un coiffeur').click();
    cy.get('#aab-online').click({ force: true });

    cy.get('#modal-prompt-input').type('Cypress Coiffeur');
    cy.get('#modal-confirm-btn').click({ force: true });

    cy.get('#barbers-list').should('contain', 'Cypress Coiffeur');
  });

  it('enregistre les réglages de fidélité et de marketing', () => {
    cy.get('[data-t="marketing"]').click();

    cy.get('#mk-threshold').clear().type('12');
    cy.get('#mk-service-pct').clear().type('35');
    cy.get('#mk-product-pct').clear().type('15');

    cy.contains('#t-marketing', 'Programme de fidélité').find('button').contains('Enregistrer').click();
    cy.get('#toast').should('contain', 'Réglages enregistrés');
  });

  it('enregistre les paramètres du salon et les identifiants SMTP', () => {
    cy.get('[data-t="settings"]').click();

    cy.contains('.card-box', 'Général').within(() => {
      cy.get('#set-salon').clear().type('Atelier Nova E2E');
      cy.get('#set-currency').select('CHF');
      cy.contains('button', 'Enregistrer').click();
    });
    cy.get('#toast').should('contain', 'Réglages enregistrés');

    cy.contains('.card-box', 'Envoi des emails (SMTP)').find('.accordion-head').click();
    cy.contains('.card-box', 'Envoi des emails (SMTP)').within(() => {
      cy.get('#set-host').clear({ force: true }).type('smtp.test.local', { force: true });
      cy.get('#set-port').clear({ force: true }).type('587', { force: true });
      cy.get('#set-user').clear({ force: true }).type('smtp-user', { force: true });
      cy.get('#set-pass').clear({ force: true }).type('smtp-password', { force: true });
      cy.get('#set-from').clear({ force: true }).type('Atelier Nova <contact@test.local>', { force: true });
      cy.contains('button', 'Enregistrer').click({ force: true });
    });
    cy.get('#toast').should('contain', 'Réglages enregistrés');
  });
});
