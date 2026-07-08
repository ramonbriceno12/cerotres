-- Base reference data
insert into units (name, abbreviation, unit_type) values
  ('Gramo', 'g', 'weight'),
  ('Kilogramo', 'kg', 'weight'),
  ('Mililitro', 'ml', 'volume'),
  ('Litro', 'l', 'volume'),
  ('Unidad', 'un', 'count')
on conflict do nothing;

insert into categories (name, description, display_order) values
  ('Pepitos', 'Pepitos venezolanos', 1),
  ('Hamburguesas', 'Hamburguesas', 2),
  ('Combos', 'Combos con acompanantes y bebida', 3),
  ('Extras', 'Extras y acompanantes', 4),
  ('Bebidas', 'Bebidas', 5)
on conflict do nothing;
