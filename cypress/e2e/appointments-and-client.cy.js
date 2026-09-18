describe('Rendez-vous et espace client', () => {
  beforeEach(() => cy.resetDemo());

  it('affiche le parcours de prise de rendez-vous avec les coiffeurs et prestations disponibles', () => {
    cy.visit('/rdv.html?salon=atelier-nova');
    cy.get('#barber-grid').should('contain', 'Nadia');
    cy.get('#barber-grid button').contains('Nadia').click();
    cy.get('#svc-grid').should('contain', 'Coupe signature');
    cy.get('#svc-grid .svc-card').first().click();
    cy.get('#service-next-btn').should('not.be.disabled');
  });

  it('connecte le client, affiche sa fidélité et ses rendez-vous', () => {
    cy.clientLogin();
    cy.get('#home-hello').should('contain', 'Léa');
    cy.get('#loyalty-points').should('contain', '8');
    cy.get('#history-list').should('be.visible');
  });

  it('permet au client d’accéder à son profil', () => {
    cy.clientLogin();
    cy.get('#nav-account').click();
    cy.get('#pf-email').should('have.value', 'lea.dupont@demo.test');
  });
});
