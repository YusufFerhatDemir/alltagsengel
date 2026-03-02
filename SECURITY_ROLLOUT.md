# Security Rollout Adımları

Bu dosya, uygulama kodu deploy edildikten sonra Supabase tarafında güvenlik hardening değişikliklerini devreye almak için hazırlanmıştır.

## 1) Uygulama deploy

Önce bu branch içindeki son commitlerin deploy edildiğinden emin olun:

- `cbf9dd6` — temel security hardening
- `02178e7` — `storage.objects` policy hardening

## 2) Supabase SQL uygulama sırası

Supabase Dashboard -> SQL Editor üzerinden aşağıdaki sırayı izleyin:

1. `security-hardening.sql` dosyasının tamamını çalıştırın.
2. Hata yoksa, yeni kurulumlarda referans almak için `supabase-setup.sql` dosyasını güncel kaynak olarak bırakın.

## 3) Smoke test checklist (SQL)

### 3.1 Documents bucket private mı?

```sql
select id, public
from storage.buckets
where id = 'documents';
```

Beklenen: `public = false`.

### 3.2 Documents tablosunda path alanı var mı?

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'documents'
  and column_name in ('storage_path', 'file_url');
```

Beklenen: `storage_path` mevcut olmalı (`file_url` legacy olarak kalabilir).

### 3.3 Messages zorunlu alanlar set edildi mi?

```sql
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'messages'
  and column_name in ('booking_id', 'sender_id', 'receiver_id');
```

Beklenen: üçü de `NO`.

### 3.4 Storage object policy’leri oluştu mu?

```sql
select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like '%documents%';
```

Beklenen policy isimleri:

- `Kullanıcı kendi documents dosyalarını yükleyebilir`
- `Kullanıcı kendi documents dosyalarını güncelleyebilir`
- `Kullanıcı kendi documents dosyalarını silebilir`
- `Admin documents dosyalarını yönetebilir`

### 3.5 Profiles select artık herkese açık mı?

```sql
select policyname
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles';
```

Beklenen:

- `Herkes profilleri okuyabilir` **olmamalı**
- `Kullanıcı gerekli profilleri okuyabilir` **olmalı**

## 4) Uygulama seviyesinde hızlı kontrol

1. Normal kullanıcı ile login -> `/auth/register?role=admin` benzeri bir istekle admin çıkmamalı.
2. Doküman yükle -> listede açılır, ancak public URL paylaşımıyla doğrudan erişim olmamalı.
3. Booking tarafı olmayan bir kullanıcıyla mesaj insert denemesi başarısız olmalı.
4. Admin Pflegebox CSV export -> `=cmd`, `+test`, `-test`, `@test` gibi başlayan hücreler formül olarak çalışmamalı.

## 5) Geri alma (acil durum)

Eğer rollout sonrası kritik bir kesinti olursa:

1. Uygulama deploy’unu bir önceki stabil commit’e çekin.
2. Supabase tarafında sadece etkilenen policy değişikliklerini geri alın (tam rollback yerine hedefli rollback önerilir).
3. `security-hardening.sql` adımlarını staging’de tekrar dry-run yapıp prod’a yeniden alın.
