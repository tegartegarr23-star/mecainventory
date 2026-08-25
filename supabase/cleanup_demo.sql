-- Jalankan sekali di Supabase SQL Editor setelah demo selesai.
-- Menghapus hanya seed demo Mecamocha, bukan data operasional lain.
begin;
delete from public.transaction_tombstones where transaction_id = 'tx-demo-opening';
delete from public.inventory_transactions where id = 'tx-demo-opening' or reference_no = 'INIT-DEMO';
delete from public.stock_movements where transaction_id = 'tx-demo-opening';
delete from public.recipe_details where recipe_id in ('recipe-latte', 'recipe-syrup');
delete from public.recipes where id in ('recipe-latte', 'recipe-syrup');
delete from public.menus where id = 'menu-latte' or name = 'Cafe Latte';
delete from public.suppliers where id = 'sup-demo' or name = 'PT Bahan Bahagia';
delete from public.ingredients where id in ('ing-sugar', 'ing-coffee', 'ing-milk', 'ing-water', 'ing-syrup') or code in ('RAW-001', 'RAW-002', 'RAW-003', 'RAW-004', 'PRE-001');
commit;
