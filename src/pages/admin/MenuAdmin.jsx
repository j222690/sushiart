import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, GripVertical, Search, Layers, Package } from 'lucide-react';
import clsx from 'clsx';
import ProductImage from '../../components/ProductImage';
import ImageUpload from '../../components/admin/ImageUpload';
import {
  Badge, Button, Card, Input, Select, Sheet, Skeleton, Switch, Textarea,
} from '../../components/ui';
import { adminCategories, adminProducts } from '../../lib/adminApi';
import { useToast } from '../../context/ToastContext';
import { centsToInput, formatBRL, parseBRLToCents } from '../../lib/format';

const EMPTY_PRODUCT = {
  name: '',
  description: '',
  category_id: '',
  price: '',
  compare_at: '',
  serves: '',
  image_url: null,
  is_bestseller: false,
  is_new: false,
  sold_out: false,
  active: true,
  sort_order: 0,
};

export default function MenuAdmin() {
  const toast = useToast();
  const [tab, setTab] = useState('produtos');

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [productSheet, setProductSheet] = useState(null); // 'novo' | produto
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [saving, setSaving] = useState(false);

  const [categorySheet, setCategorySheet] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', slug: '', sort_order: 0, active: true });

  const [addonProduct, setAddonProduct] = useState(null);
  const [addonGroups, setAddonGroups] = useState([]);

  const load = useCallback(async () => {
    try {
      const [cats, prods] = await Promise.all([
        adminCategories.list('sort_order'),
        adminProducts.listWithCategory(),
      ]);
      setCategories(cats);
      setProducts(prods);
    } catch (error) {
      toast.error(error.message);
      setProducts([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!products) return [];
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchesTerm = !term || p.name.toLowerCase().includes(term);
      const matchesCategory = !categoryFilter || p.category_id === categoryFilter;
      return matchesTerm && matchesCategory;
    });
  }, [products, search, categoryFilter]);

  // ---------------------------------------------------------------- produtos
  function openProduct(product) {
    if (product === 'novo') {
      setForm({ ...EMPTY_PRODUCT, category_id: categories[0]?.id ?? '' });
    } else {
      setForm({
        ...product,
        price: centsToInput(product.price_cents),
        compare_at: centsToInput(product.compare_at_price_cents),
      });
    }
    setProductSheet(product);
  }

  async function saveProduct() {
    const priceCents = parseBRLToCents(form.price);
    if (!form.name.trim()) return toast.error('Informe o nome do produto.');
    if (!form.category_id) return toast.error('Escolha uma categoria.');
    if (priceCents <= 0) return toast.error('Informe um preço válido.');

    const compareCents = form.compare_at ? parseBRLToCents(form.compare_at) : null;
    if (compareCents && compareCents <= priceCents) {
      return toast.error('O preço "de" precisa ser maior que o preço atual.');
    }

    const payload = {
      name: form.name.trim(),
      description: form.description?.trim() || null,
      category_id: form.category_id,
      price_cents: priceCents,
      compare_at_price_cents: compareCents,
      serves: form.serves?.trim() || null,
      image_url: form.image_url,
      is_bestseller: form.is_bestseller,
      is_new: form.is_new,
      sold_out: form.sold_out,
      active: form.active,
      sort_order: Number(form.sort_order) || 0,
    };

    setSaving(true);
    try {
      if (productSheet === 'novo') await adminProducts.create(payload);
      else await adminProducts.update(productSheet.id, payload);

      toast.success('Produto salvo.');
      setProductSheet(null);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeProduct(product) {
    if (!window.confirm(`Excluir "${product.name}"? Pedidos antigos mantêm o registro.`)) return;
    try {
      await adminProducts.remove(product.id);
      toast.info('Produto excluído.');
      await load();
    } catch {
      // FK de pedidos antigos impede o delete: desativar é o caminho certo.
      toast.error('Este produto já foi vendido. Desative-o em vez de excluir.');
    }
  }

  async function toggleSoldOut(product) {
    try {
      await adminProducts.toggleSoldOut(product.id, !product.sold_out);
      setProducts((current) =>
        current.map((p) => (p.id === product.id ? { ...p, sold_out: !p.sold_out } : p))
      );
    } catch (error) {
      toast.error(error.message);
    }
  }

  // -------------------------------------------------------------- categorias
  function openCategory(category) {
    setCategoryForm(
      category === 'nova'
        ? { name: '', slug: '', sort_order: categories.length + 1, active: true }
        : category
    );
    setCategorySheet(category);
  }

  async function saveCategory() {
    const name = categoryForm.name.trim();
    if (!name) return toast.error('Informe o nome da categoria.');

    const slug =
      (categoryForm.slug || name)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    const payload = {
      name,
      slug,
      sort_order: Number(categoryForm.sort_order) || 0,
      active: categoryForm.active,
      image_url: categoryForm.image_url ?? null,
    };

    setSaving(true);
    try {
      if (categorySheet === 'nova') await adminCategories.create(payload);
      else await adminCategories.update(categorySheet.id, payload);

      toast.success('Categoria salva.');
      setCategorySheet(null);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------- adicionais
  async function openAddons(product) {
    setAddonProduct(product);
    try {
      setAddonGroups(await adminProducts.addonGroups(product.id));
    } catch (error) {
      toast.error(error.message);
      setAddonGroups([]);
    }
  }

  async function reloadAddons() {
    setAddonGroups(await adminProducts.addonGroups(addonProduct.id));
  }

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-brand text-2xl text-cream">Cardápio</h1>
          <p className="text-sm text-cream-muted">Produtos, categorias e adicionais.</p>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => openCategory('nova')}>
            <Layers size={15} /> Nova categoria
          </Button>
          <Button onClick={() => openProduct('novo')}>
            <Plus size={15} /> Novo produto
          </Button>
        </div>
      </header>

      <div className="mb-4 flex gap-2 border-b border-line">
        {[
          { key: 'produtos', label: 'Produtos' },
          { key: 'categorias', label: 'Categorias' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={clsx(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === item.key
                ? 'border-vinho-500 text-cream'
                : 'border-transparent text-cream-muted hover:text-cream'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'produtos' && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto"
                className="h-10 w-full rounded-xl border border-line bg-ink-300 pl-9 pr-3 text-sm text-cream placeholder:text-cream-faint"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 rounded-xl border border-line bg-ink-300 px-3 text-sm text-cream"
            >
              <option value="">Todas as categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {products === null ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((product) => (
                <Card key={product.id} className="flex items-center gap-3 p-3">
                  <ProductImage
                    src={product.image_url}
                    alt={product.name}
                    className="h-16 w-16 shrink-0"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-cream">{product.name}</p>
                      {!product.active && <Badge tone="neutral">Inativo</Badge>}
                      {product.sold_out && <Badge tone="danger">Esgotado</Badge>}
                      {product.is_bestseller && <Badge tone="vinho">Mais vendido</Badge>}
                      {product.is_new && <Badge tone="ember">Novidade</Badge>}
                    </div>
                    <p className="truncate text-xs text-cream-muted">
                      {product.categories?.name} · {formatBRL(product.price_cents)}
                      {product.compare_at_price_cents
                        ? ` (de ${formatBRL(product.compare_at_price_cents)})`
                        : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant={product.sold_out ? 'danger' : 'ghost'}
                      onClick={() => toggleSoldOut(product)}
                      title="Marcar como esgotado"
                    >
                      {product.sold_out ? 'Esgotado' : 'Disponível'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openAddons(product)} title="Adicionais">
                      <Package size={15} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openProduct(product)}>
                      <Pencil size={15} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      onClick={() => removeProduct(product)}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </Card>
              ))}

              {filtered.length === 0 && (
                <p className="py-10 text-center text-sm text-cream-faint">Nenhum produto encontrado.</p>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'categorias' && (
        <div className="space-y-2">
          {categories.map((category) => (
            <Card key={category.id} className="flex items-center gap-3 p-3.5">
              <GripVertical size={16} className="shrink-0 text-cream-faint" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-cream">{category.name}</p>
                <p className="text-xs text-cream-faint">
                  /{category.slug} · ordem {category.sort_order} ·{' '}
                  {products?.filter((p) => p.category_id === category.id).length ?? 0} produtos
                </p>
              </div>
              {!category.active && <Badge tone="neutral">Inativa</Badge>}
              <Button size="sm" variant="ghost" onClick={() => openCategory(category)}>
                <Pencil size={15} />
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* ------------------------------ Sheet: produto ------------------------------ */}
      <Sheet
        open={Boolean(productSheet)}
        onClose={() => setProductSheet(null)}
        size="lg"
        title={productSheet === 'novo' ? 'Novo produto' : 'Editar produto'}
        footer={
          <Button className="w-full" loading={saving} onClick={saveProduct}>
            Salvar produto
          </Button>
        }
      >
        <div className="space-y-4">
          <ImageUpload
            value={form.image_url}
            onChange={(url) => setForm((c) => ({ ...c, image_url: url }))}
          />

          <Input
            label="Nome"
            value={form.name}
            onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
          />

          <Textarea
            label="Descrição"
            value={form.description ?? ''}
            onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
            placeholder="Ingredientes, modo de preparo, o que torna esse prato especial"
          />

          <Select
            label="Categoria"
            value={form.category_id}
            onChange={(e) => setForm((c) => ({ ...c, category_id: e.target.value }))}
          >
            <option value="">Selecione</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Preço"
              inputMode="decimal"
              placeholder="0,00"
              value={form.price}
              onChange={(e) => setForm((c) => ({ ...c, price: e.target.value }))}
            />
            <Input
              label='Preço "de" (riscado)'
              inputMode="decimal"
              placeholder="opcional"
              value={form.compare_at ?? ''}
              onChange={(e) => setForm((c) => ({ ...c, compare_at: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Porção"
              placeholder="Ex: 20 peças, serve 2"
              value={form.serves ?? ''}
              onChange={(e) => setForm((c) => ({ ...c, serves: e.target.value }))}
            />
            <Input
              label="Ordem"
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm((c) => ({ ...c, sort_order: e.target.value }))}
            />
          </div>

          <div className="space-y-3 rounded-xl border border-line bg-ink-300 p-4">
            <Switch
              checked={form.active}
              onChange={(v) => setForm((c) => ({ ...c, active: v }))}
              label="Ativo no cardápio"
              description="Desligado, some do app"
            />
            <Switch
              checked={form.sold_out}
              onChange={(v) => setForm((c) => ({ ...c, sold_out: v }))}
              label="Esgotado hoje"
              description="Continua visível, mas não pode ser pedido"
            />
            <Switch
              checked={form.is_bestseller}
              onChange={(v) => setForm((c) => ({ ...c, is_bestseller: v }))}
              label="Mais vendido"
              description="Ganha selo e aparece na home"
            />
            <Switch
              checked={form.is_new}
              onChange={(v) => setForm((c) => ({ ...c, is_new: v }))}
              label="Novidade"
              description="Ganha selo de novidade"
            />
          </div>
        </div>
      </Sheet>

      {/* ------------------------------ Sheet: categoria ------------------------------ */}
      <Sheet
        open={Boolean(categorySheet)}
        onClose={() => setCategorySheet(null)}
        title={categorySheet === 'nova' ? 'Nova categoria' : 'Editar categoria'}
        footer={
          <Button className="w-full" loading={saving} onClick={saveCategory}>
            Salvar categoria
          </Button>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nome"
            value={categoryForm.name}
            onChange={(e) => setCategoryForm((c) => ({ ...c, name: e.target.value }))}
            placeholder="Combos, Pokes, Alacarte..."
          />
          <Input
            label="Slug (URL)"
            value={categoryForm.slug ?? ''}
            onChange={(e) => setCategoryForm((c) => ({ ...c, slug: e.target.value }))}
            hint="Deixe em branco para gerar a partir do nome."
          />
          <Input
            label="Ordem de exibição"
            type="number"
            value={categoryForm.sort_order}
            onChange={(e) => setCategoryForm((c) => ({ ...c, sort_order: e.target.value }))}
          />
          <ImageUpload
            label="Imagem da categoria"
            folder="categorias"
            value={categoryForm.image_url}
            onChange={(url) => setCategoryForm((c) => ({ ...c, image_url: url }))}
          />
          <div className="rounded-xl border border-line bg-ink-300 p-4">
            <Switch
              checked={categoryForm.active}
              onChange={(v) => setCategoryForm((c) => ({ ...c, active: v }))}
              label="Categoria ativa"
            />
          </div>
        </div>
      </Sheet>

      {/* ------------------------------ Sheet: adicionais ------------------------------ */}
      <AddonsSheet
        product={addonProduct}
        groups={addonGroups}
        onClose={() => setAddonProduct(null)}
        onChanged={reloadAddons}
      />
    </div>
  );
}

/** Grupos de adicionais de um produto (ex: "Extras", com até N escolhas). */
function AddonsSheet({ product, groups, onClose, onChanged }) {
  const toast = useToast();
  const [groupName, setGroupName] = useState('');
  const [maxSelect, setMaxSelect] = useState(3);
  const [minSelect, setMinSelect] = useState(0);
  const [newAddon, setNewAddon] = useState({});

  async function createGroup() {
    if (!groupName.trim()) return toast.error('Dê um nome ao grupo.');
    try {
      await adminProducts.createAddonGroup({
        product_id: product.id,
        name: groupName.trim(),
        min_select: Number(minSelect) || 0,
        max_select: Math.max(1, Number(maxSelect) || 1),
        sort_order: groups.length + 1,
      });
      setGroupName('');
      await onChanged();
      toast.success('Grupo criado.');
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function addAddon(group) {
    const draft = newAddon[group.id];
    if (!draft?.name?.trim()) return toast.error('Informe o nome do adicional.');

    try {
      await adminProducts.saveAddon({
        group_id: group.id,
        name: draft.name.trim(),
        price_cents: parseBRLToCents(draft.price),
        sort_order: (group.product_addons?.length ?? 0) + 1,
      });
      setNewAddon((c) => ({ ...c, [group.id]: { name: '', price: '' } }));
      await onChanged();
    } catch (error) {
      toast.error(error.message);
    }
  }

  return (
    <Sheet
      open={Boolean(product)}
      onClose={onClose}
      size="lg"
      title={product ? `Adicionais · ${product.name}` : ''}
    >
      {groups.map((group) => (
        <Card key={group.id} className="mb-3 p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-cream">{group.name}</p>
              <p className="text-[11px] text-cream-faint">
                {group.min_select > 0 ? `mín. ${group.min_select} · ` : ''}até {group.max_select}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={async () => {
                if (!window.confirm(`Excluir o grupo "${group.name}" e seus adicionais?`)) return;
                await adminProducts.removeAddonGroup(group.id);
                await onChanged();
              }}
            >
              <Trash2 size={14} />
            </Button>
          </div>

          <ul className="mb-3 divide-y divide-line">
            {(group.product_addons ?? []).map((addon) => (
              <li key={addon.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-cream">{addon.name}</span>
                <span className="text-cream-muted">{formatBRL(addon.price_cents)}</span>
                <button
                  type="button"
                  onClick={async () => {
                    await adminProducts.removeAddon(addon.id);
                    await onChanged();
                  }}
                  className="rounded p-1 text-cream-faint hover:text-danger"
                  aria-label={`Excluir ${addon.name}`}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <Input
              placeholder="Nome do adicional"
              value={newAddon[group.id]?.name ?? ''}
              onChange={(e) =>
                setNewAddon((c) => ({ ...c, [group.id]: { ...c[group.id], name: e.target.value } }))
              }
              className="flex-1"
            />
            <Input
              placeholder="0,00"
              inputMode="decimal"
              value={newAddon[group.id]?.price ?? ''}
              onChange={(e) =>
                setNewAddon((c) => ({ ...c, [group.id]: { ...c[group.id], price: e.target.value } }))
              }
              className="w-24"
            />
            <Button onClick={() => addAddon(group)}>
              <Plus size={15} />
            </Button>
          </div>
        </Card>
      ))}

      <Card className="border-dashed p-4">
        <p className="mb-3 text-sm font-semibold text-cream">Novo grupo</p>
        <div className="space-y-3">
          <Input
            placeholder="Ex: Extras, Escolha a proteína"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Mínimo"
              type="number"
              min={0}
              value={minSelect}
              onChange={(e) => setMinSelect(e.target.value)}
            />
            <Input
              label="Máximo"
              type="number"
              min={1}
              value={maxSelect}
              onChange={(e) => setMaxSelect(e.target.value)}
            />
          </div>
          <Button className="w-full" onClick={createGroup}>
            <Plus size={15} /> Criar grupo
          </Button>
        </div>
      </Card>
    </Sheet>
  );
}
