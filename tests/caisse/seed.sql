-- Donnees minimales des tests de la caisse (base de TEST uniquement).
INSERT INTO owners (id,name,email,admin_password,email_verified) VALUES ('o1','Test','t@t.fr','adminpw',1);
INSERT INTO salons (id,owner_id,name,slug,is_default) VALUES ('s1','o1','Salon Test','test',1);
INSERT INTO barbers (id,salon_id,name,pin_code) VALUES ('b1','s1','Alice','1111'),('b2','s1','Bob','2222');
INSERT INTO services (id,salon_id,name,duration_min,price_cents) VALUES ('sv1','s1','Coupe',30,2000);
INSERT INTO products (id,salon_id,name,price_cents,category,stock_enabled,stock_quantity) VALUES ('p1','s1','Gel',500,'coiffage',1,3);
