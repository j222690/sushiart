import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, MapPin, Heart, Sparkles, Bell, LogOut, ChevronRight, Clock, Instagram, ShieldCheck,
} from 'lucide-react';
import { Logo } from '../../components/Logo';
import PortaDosFundos from '../../components/PortaDosFundos';
import InstalarApp from '../../components/InstalarApp';
import { Button, Card, Input, Sheet, Switch } from '../../components/ui';
import { profile as profileApi, promo } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { useToast } from '../../context/ToastContext';
import { formatPhone, shortHour, WEEKDAYS } from '../../lib/format';
import { requestPushPermission } from '../../lib/push';

function Row({ icon: Icon, label, value, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink-300"
    >
      <Icon size={18} className="shrink-0 text-cream-muted" />
      <span className="min-w-0 flex-1 text-sm text-cream">{label}</span>
      {value && <span className="shrink-0 text-xs text-cream-faint">{value}</span>}
      <ChevronRight size={16} className="shrink-0 text-cream-faint" />
    </button>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, customer, isStaff, signOut, setCustomer } = useAuth();
  const { restaurant, hours } = useStore();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [points, setPoints] = useState(null);
  const [hoursSheet, setHoursSheet] = useState(false);

  useEffect(() => {
    if (customer) setForm({ name: customer.name ?? '', phone: formatPhone(customer.phone ?? '') });
  }, [customer]);

  useEffect(() => {
    if (!user) return;
    promo.loyaltyBalance().then(setPoints).catch(() => setPoints(null));
  }, [user]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await profileApi.update(user.id, {
        name: form.name.trim(),
        phone: form.phone.replace(/\D/g, '') || null,
      });
      setCustomer(updated);
      setEditing(false);
      toast.success('Perfil atualizado.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePush(enabled) {
    if (!enabled) return;
    const result = await requestPushPermission(user?.id);
    if (result.ok) toast.success('Notificações ativadas.');
    else toast.error(result.reason);
  }

  if (!user) {
    return (
      <div className="px-5 pt-10">
        <div className="flex flex-col items-center text-center">
          {/* Sete toques na marca abrem o painel. É por aqui que o dono entra
              no app instalado, que não tem barra de endereço para digitar
              /admin. Ver o comentário do componente: não é segurança, é
              atalho. */}
          <PortaDosFundos>
            <Logo size="lg" />
          </PortaDosFundos>
          <p className="mt-6 text-sm text-cream-muted">
            Entre para acompanhar pedidos, salvar endereços e acumular pontos.
          </p>
          <Button size="lg" className="mt-6 w-full" onClick={() => navigate('/entrar?next=/perfil')}>
            Entrar ou criar conta
          </Button>
        </div>

        <div className="mt-8">
          <InstalarApp />
        </div>

        <Card className="divide-y divide-line overflow-hidden">
          <Row icon={Clock} label="Horário de funcionamento" onClick={() => setHoursSheet(true)} />
        </Card>

        <HoursSheet open={hoursSheet} onClose={() => setHoursSheet(false)} hours={hours} />
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 pt-4">
      <Card className="mb-4 flex items-center gap-3.5 p-4">
        {/* O mesmo gesto da tela deslogada, agora na bolinha da inicial.
            Precisa existir nos DOIS estados: o dono pode estar logado com uma
            conta que ainda não é da equipe, e aí não teria nenhum caminho
            para o painel. */}
        <PortaDosFundos>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-vinho-gradient text-lg font-bold text-white">
            {(customer?.name || user.email || '?').charAt(0).toUpperCase()}
          </span>
        </PortaDosFundos>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-cream">
            {customer?.name || 'Complete seu cadastro'}
          </p>
          <p className="truncate text-xs text-cream-muted">{user.email}</p>
          {customer?.phone && (
            <p className="truncate text-xs text-cream-faint">{formatPhone(customer.phone)}</p>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          Editar
        </Button>
      </Card>

      {points !== null && (
        <button
          type="button"
          onClick={() => navigate('/fidelidade')}
          className="mb-4 flex w-full items-center gap-3 rounded-card border border-ember/25 bg-ember/5 p-4"
        >
          <Sparkles size={20} className="text-ember" />
          <span className="flex-1 text-left">
            <span className="block text-sm font-semibold text-cream">{points} pontos</span>
            <span className="block text-xs text-cream-muted">Programa de fidelidade</span>
          </span>
          <ChevronRight size={16} className="text-cream-faint" />
        </button>
      )}

      <InstalarApp />

      <Card className="mb-4 divide-y divide-line overflow-hidden">
        <Row icon={MapPin} label="Meus endereços" onClick={() => navigate('/enderecos')} />
        <Row icon={Heart} label="Favoritos" onClick={() => navigate('/favoritos')} />
        <Row icon={Bell} label="Notificações" onClick={() => navigate('/notificacoes')} />
      </Card>

      <Card className="mb-4 p-4">
        <Switch
          checked={Boolean(customer?.marketing_opt_in)}
          onChange={async (value) => {
            try {
              const updated = await profileApi.update(user.id, { marketing_opt_in: value });
              setCustomer(updated);
              await handlePush(value);
            } catch (error) {
              toast.error(error.message);
            }
          }}
          label="Avisos de ofertas"
          description="Roleta liberada, cupons novos e promoções"
        />
      </Card>

      <Card className="mb-4 divide-y divide-line overflow-hidden">
        <Row icon={Clock} label="Horário de funcionamento" onClick={() => setHoursSheet(true)} />
        {restaurant?.instagram && (
          <Row
            icon={Instagram}
            label="Nosso Instagram"
            value="@sushiartchapeco"
            onClick={() => {
              // Só abrimos http(s): um valor inesperado salvo no admin não vira
              // execução de script no navegador do cliente.
              if (/^https?:\/\//i.test(restaurant.instagram)) {
                window.open(restaurant.instagram, '_blank', 'noopener,noreferrer');
              }
            }}
          />
        )}
        {isStaff && (
          <Row icon={ShieldCheck} label="Painel do restaurante" onClick={() => navigate('/admin')} />
        )}
      </Card>

      <Button
        variant="ghost"
        className="w-full text-cream-muted"
        onClick={async () => {
          await signOut();
          navigate('/');
        }}
      >
        <LogOut size={16} /> Sair da conta
      </Button>

      {/* Rodapé legal. Fica aqui, no fim do Perfil, porque é onde as pessoas
          procuram esse tipo de link — e porque o Google confere se a política
          de privacidade está de fato alcançável dentro do app, não só no
          cadastro do OAuth. */}
      <nav className="mt-6 flex items-center justify-center gap-3 text-[11px]">
        <a href="/privacidade" className="text-cream-faint underline-offset-2 hover:text-cream-muted hover:underline">
          Privacidade
        </a>
        <span aria-hidden="true" className="text-cream-faint">·</span>
        <a href="/termos" className="text-cream-faint underline-offset-2 hover:text-cream-muted hover:underline">
          Termos de uso
        </a>
      </nav>

      <p className="mt-2 text-center text-[11px] text-cream-faint">
        {restaurant?.name} · {restaurant?.address_city}/{restaurant?.address_state}
      </p>

      {/* Editar perfil */}
      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title="Editar perfil"
        footer={
          <Button className="w-full" loading={saving} onClick={handleSave}>
            Salvar
          </Button>
        }
      >
        <div className="space-y-3.5">
          <Input
            label="Nome"
            value={form.name}
            onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
          />
          <Input
            label="Celular"
            value={form.phone}
            inputMode="tel"
            onChange={(e) => setForm((c) => ({ ...c, phone: formatPhone(e.target.value) }))}
          />
          <Input label="E-mail" value={user.email} disabled hint="O e-mail não pode ser alterado por aqui." />
        </div>
      </Sheet>

      <HoursSheet open={hoursSheet} onClose={() => setHoursSheet(false)} hours={hours} />
    </div>
  );
}

function HoursSheet({ open, onClose, hours }) {
  return (
    <Sheet open={open} onClose={onClose} title="Horário de funcionamento">
      <ul className="divide-y divide-line">
        {WEEKDAYS.map((day, weekday) => {
          const slots = hours.filter((h) => h.weekday === weekday && h.active);
          return (
            <li key={day} className="flex items-center justify-between py-3 text-sm">
              <span className="text-cream">{day}</span>
              <span className={slots.length ? 'text-cream-muted' : 'text-cream-faint'}>
                {slots.length
                  ? slots.map((s) => `${shortHour(s.opens_at)} – ${shortHour(s.closes_at)}`).join(' · ')
                  : 'Fechado'}
              </span>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
