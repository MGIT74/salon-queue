describe('Caisse', () => {
  beforeEach(() => {
    cy.resetDemo();
    cy.barberLogin();
  });

  it('authentifie un coiffeur par PIN et affiche son catalogue', () => {
    cy.get('#my-name').should('contain', 'Thomas');
    cy.get('#item-grid').should('contain', 'Coupe signature');
    cy.get('[data-cat="products"]').click();
    cy.get('#item-grid').should('contain', 'Cire coiffante mate');
  });

  it('encaisse un produit en espèces et affiche le reçu', () => {
    cy.get('[data-cat="products"]').click();
    cy.get('#item-grid').contains('Boisson fraîche').click();
    cy.get('#ticket-total').should('contain', '2,50');
    cy.get('#pay-especes').click();
    cy.get('#receipt-overlay').should('be.visible').and('contain', 'Espèces');
  });
});
