describe('Borne et écran public', () => {
  beforeEach(() => cy.resetDemo());

  it('permet à un client de rejoindre la file depuis la borne', () => {
    cy.task('makeDemoKioskAvailable');
    cy.visit('/kiosk.html?salon=atelier-nova');

    // L'écran de veille couvre la borne au chargement : on le ferme comme un client
    cy.get('#idle-screen').click();

    cy.get('#barber-grid').should('contain', 'Thomas');
    cy.get('#barber-grid button').contains('Thomas').click();
    cy.get('#f-name').type('Test Cypress');
    cy.get('#svc-grid .svc-card').contains('Coupe signature').click();
    cy.get('#step1-next-btn').click();
    cy.get('#submit-btn').click();
    cy.get('#p-ticket').should('have.class', 'on').and('contain', 'Test Cypress');
  });

  it('reflète l’état de la file sur l’écran public', () => {
    cy.visit('/display.html?salon=atelier-nova');
    cy.get('#chairs').should('contain', 'Alexandre Morel');
    cy.get('#queue').should('contain', 'Léa Dupont');
  });
});
