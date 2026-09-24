describe('Authentification administrateur', () => {
  beforeEach(() => cy.resetDemo());

  it('connecte le propriétaire avec son email et son mot de passe', () => {
    cy.adminLogin();
    cy.get('#tabs').should('contain', "File d'attente");
  });

  it('refuse un mot de passe erroné sans ouvrir le dashboard', () => {
    cy.visit('/dashboard.html?salon=atelier-nova');
    cy.get('#login-email').type('demo@atelier-nova.test');
    cy.get('#pw').type('mauvais-mot-de-passe');
    cy.contains('button', 'Entrer').click();
    cy.get('#app').should('not.be.visible');
    // La connexion universelle ne révèle pas si l'email ou le mot de
    // passe est erroné, afin d'éviter l'énumération des comptes.
    cy.get('#toast').should('be.visible').and('contain', 'Email ou mot de passe incorrect');
  });

  it('rétablit une session au rechargement', () => {
    cy.adminLogin();
    cy.reload();
    cy.get('#app').should('be.visible');
  });
});
