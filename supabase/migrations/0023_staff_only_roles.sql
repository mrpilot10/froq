-- Collapse manager into staff. Roles going forward: owner | staff.
update merchant_members set role = 'staff' where role = 'manager';
