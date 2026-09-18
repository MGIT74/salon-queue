describe('Dashboard administrateur', () => {
  beforeEach(() => {
    cy.resetDemo();
    cy.adminLogin();
  });

  it('affiche la file, les clients en cours et les statistiques', () => {
    cy.get('#waiting-list').should('contain', 'Léa Dupont').and('contain', 'Karim Benali');
    cy.get('#active-panel').should('contain', 'Alexandre Morel');
    cy.get('#s-wait').should('not.have.text', '0');
  });

  it('charge les catalogues et les produits', () => {
    cy.get('[data-t="services"]').click();
    cy.get('#services-list').should('contain', 'Coupe signature');
    cy.get('[data-t="extras"]').click();
    cy.get('#extras-list').should('contain', 'Shampooing relaxant');
    cy.get('[data-t="products"]').click();
    cy.get('#products-list').should('contain', 'Cire coiffante mate');
  });

  it('charge les écrans marketing, caisse, agenda, équipe, clients et réglages', () => {
    [
      ['marketing', '#loyalty-accounts-list', 'Léa Dupont'],
      ['caisse', '#caisse-sales-count', 'vente'],
      ['rdv', '#rdv-list', 'Maya Ravel'],
      ['barbers', '#barbers-list', 'Nadia'],
      ['clients', '#clients-list', 'Léa Dupont'],
      ['settings', '#set-salon', null]
    ].forEach(([tab, selector, text]) => {
      cy.get('[data-t="' + tab + '"]').click();
      cy.get(selector).should('be.visible');
      if (text) cy.get(selector).should('contain', text);
    });
  });
});
