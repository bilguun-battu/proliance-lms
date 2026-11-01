-- Proliance сургалтын систем (Хувилбар А) — өгөгдлийн сангийн бүтэц
-- PostgreSQL 13+

CREATE TABLE IF NOT EXISTS orgs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  contact_name  text,
  phone         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE,
  name           text NOT NULL,
  phone          text,
  position       text,
  role           text NOT NULL CHECK (role IN ('ADMIN','COORDINATOR','LEARNER')),
  org_id         uuid REFERENCES orgs(id) ON DELETE SET NULL,
  password_hash  text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_org_idx ON users(org_id);

-- Нууц үг тохируулах / сэргээх холбоос
CREATE TABLE IF NOT EXISTS password_tokens (
  token       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE TABLE IF NOT EXISTS products (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code      text NOT NULL UNIQUE,
  name      text NOT NULL,
  category  text NOT NULL
);

CREATE TABLE IF NOT EXISTS org_products (
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (org_id, product_id)
);

CREATE TABLE IF NOT EXISTS courses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  due_days     int  NOT NULL DEFAULT 30,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_products (
  course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, product_id)
);

CREATE TABLE IF NOT EXISTS course_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  number        int  NOT NULL,
  status        text NOT NULL CHECK (status IN ('DRAFT','PUBLISHED')),
  notes         text NOT NULL DEFAULT '',
  removed       jsonb NOT NULL DEFAULT '[]',
  published_at  timestamptz,
  UNIQUE (course_id, number)
);

-- Модуль. module_key нь хувилбар хооронд тогтмол, mver нь агуулга өөрчлөгдөхөд өснө.
CREATE TABLE IF NOT EXISTS modules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id    uuid NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
  module_key    text NOT NULL,
  position      int  NOT NULL,
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  duration_min  int  NOT NULL DEFAULT 10,
  video_file    uuid,
  pdf_file      uuid,
  pass_score    int  NOT NULL DEFAULT 70,
  mver          int  NOT NULL DEFAULT 1,
  added_in      int  NOT NULL DEFAULT 1,
  change        text NOT NULL DEFAULT 'NEW' CHECK (change IN ('NEW','CHANGED','SAME')),
  mandatory     boolean NOT NULL DEFAULT true,
  UNIQUE (version_id, module_key)
);

CREATE TABLE IF NOT EXISTS questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id      uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  position       int  NOT NULL,
  text           text NOT NULL,
  options        jsonb NOT NULL,
  correct_index  int  NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  mime        text NOT NULL,
  size        bigint NOT NULL,
  path        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_progress (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_key  text NOT NULL,
  mver        int  NOT NULL,
  position_s  real NOT NULL DEFAULT 0,
  watched_s   real NOT NULL DEFAULT 0,
  duration_s  real NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id, module_key, mver)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_key  text NOT NULL,
  mver        int  NOT NULL,
  score       int  NOT NULL,
  passed      boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS completions (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id     uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_key    text NOT NULL,
  mver          int  NOT NULL,
  score         int,
  completed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id, module_key, mver)
);

CREATE TABLE IF NOT EXISTS notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id       uuid REFERENCES courses(id) ON DELETE CASCADE,
  version_number  int,
  kind            text NOT NULL DEFAULT 'VERSION',
  title           text NOT NULL,
  body            text NOT NULL,
  due_at          timestamptz,
  read_at         timestamptz,
  email_status    text,
  sms_status      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);

-- Хэн, хэзээ, юу хийсэн бүртгэл
CREATE TABLE IF NOT EXISTS activity_log (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   uuid REFERENCES courses(id) ON DELETE CASCADE,
  module_key  text,
  action      text NOT NULL,
  detail      text,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_user_idx ON activity_log(user_id, at DESC);

-- ===== Хувилбар А: биечлэн болон онлайн шууд хичээл =====
ALTER TABLE modules ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'ELEARN';
DO $$ BEGIN
  ALTER TABLE modules ADD CONSTRAINT modules_format_chk CHECK (format IN ('ELEARN','INPERSON','ONLINE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS sequential boolean NOT NULL DEFAULT false;

-- Хичээлийн хуваарь (биечлэн эсвэл онлайн шууд модульд)
CREATE TABLE IF NOT EXISTS sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_key    text NOT NULL,
  starts_at     timestamptz NOT NULL,
  duration_min  int  NOT NULL DEFAULT 60,
  location      text NOT NULL DEFAULT '',
  link          text,
  instructor    text,
  seats         int  NOT NULL DEFAULT 10,
  notes         text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','CANCELLED')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_course_idx ON sessions(course_id, module_key, starts_at);

CREATE TABLE IF NOT EXISTS session_attendees (
  session_id     uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED','ATTENDED','ABSENT')),
  registered_at  timestamptz NOT NULL DEFAULT now(),
  reminded_at    timestamptz,
  marked_at      timestamptz,
  PRIMARY KEY (session_id, user_id)
);

-- ===== Шалгалт: хувилбартай асуултын сан, QR холбоосоор өгөх =====
CREATE TABLE IF NOT EXISTS exams (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_key    text,
  title         text NOT NULL,
  duration_min  int  NOT NULL DEFAULT 20,
  pass_score    int  NOT NULL DEFAULT 70,
  shuffle       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_variants (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id   uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  name      text NOT NULL,
  position  int  NOT NULL
);

CREATE TABLE IF NOT EXISTS exam_questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id     uuid NOT NULL REFERENCES exam_variants(id) ON DELETE CASCADE,
  position       int  NOT NULL,
  text           text NOT NULL,
  options        jsonb NOT NULL,
  correct_index  int  NOT NULL
);

-- Нэг удаагийн шалгалтын холбоос (QR). closed_at эсвэл closes_at өнгөрвөл ажиллахгүй.
CREATE TABLE IF NOT EXISTS exam_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  session_id  uuid REFERENCES sessions(id) ON DELETE SET NULL,
  token       text NOT NULL UNIQUE,
  opened_at   timestamptz NOT NULL DEFAULT now(),
  closes_at   timestamptz NOT NULL,
  closed_at   timestamptz
);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES exam_runs(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  variant_id    uuid NOT NULL REFERENCES exam_variants(id) ON DELETE CASCADE,
  question_ids  jsonb NOT NULL,
  answers       jsonb,
  score         int,
  passed        boolean,
  started_at    timestamptz NOT NULL DEFAULT now(),
  submitted_at  timestamptz,
  UNIQUE (run_id, user_id)
);

-- ===== Хичээлийн үнэлгээ: хичээлийн төрөл эсвэл сургалт бүрт маягт, QR-ээр бөглөх =====
CREATE TABLE IF NOT EXISTS eval_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  format      text CHECK (format IN ('ELEARN','INPERSON','ONLINE')),  -- хичээлийн төрөл (NULL = бүх төрөл)
  course_id   uuid REFERENCES courses(id) ON DELETE CASCADE,           -- тодорхой сургалтад (NULL = бүх сургалт)
  anonymous   boolean NOT NULL DEFAULT true,
  intro       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eval_questions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES eval_templates(id) ON DELETE CASCADE,
  position     int  NOT NULL,
  section      text NOT NULL DEFAULT '',
  kind         text NOT NULL CHECK (kind IN ('RATING','CHOICE','TEXT')),
  text         text NOT NULL,
  options      jsonb NOT NULL DEFAULT '[]',
  required     boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES eval_templates(id) ON DELETE CASCADE,
  session_id   uuid REFERENCES sessions(id) ON DELETE SET NULL,
  course_id    uuid REFERENCES courses(id) ON DELETE SET NULL,
  instructor   text,
  token        text NOT NULL UNIQUE,
  opened_at    timestamptz NOT NULL DEFAULT now(),
  closes_at    timestamptz NOT NULL,
  closed_at    timestamptz
);

-- Асуултын хувилбар хадгалагдана: маягтыг дараа нь засахад өмнөх хариулт эвдрэхгүй
CREATE TABLE IF NOT EXISTS eval_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers       jsonb NOT NULL,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, user_id)
);

-- ===== Дотоод сургалт ба заавал суух сургалт (compliance) =====
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS for_customers boolean NOT NULL DEFAULT true;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS for_internal boolean NOT NULL DEFAULT false;

-- Заавал суух сургалтын оноолт
CREATE TABLE IF NOT EXISTS assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  target            text NOT NULL CHECK (target IN ('ALL_INTERNAL','DEPARTMENT','POSITION','ORG','USER')),
  target_value      text,                 -- хэлтэс/албан тушаалын нэр, байгууллага эсвэл хэрэглэгчийн id
  due_days          int  NOT NULL DEFAULT 30,   -- оноогдсон (эсвэл ажилд орсон) өдрөөс хойш
  due_date          date,                 -- тогтмол эцсийн хугацаа (байвал due_days-ыг орлоно)
  recurrence_months int,                  -- давтан суух давтамж (NULL = нэг удаа)
  note              text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assignments_course_idx ON assignments(course_id);

-- ===== Дотоод/харилцагчийн сургалтыг тусгаарлах; OJT, VoC, Train the Trainer =====
ALTER TABLE courses ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'CUSTOMER';
DO $$ BEGIN
  ALTER TABLE courses ADD CONSTRAINT courses_audience_chk CHECK (audience IN ('CUSTOMER','INTERNAL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE courses SET audience='INTERNAL' WHERE for_internal AND NOT for_customers AND audience='CUSTOMER';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'ELEARN';
ALTER TABLE courses ALTER COLUMN category SET DEFAULT 'ELEARN';
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_category_chk;

ALTER TABLE modules DROP CONSTRAINT IF EXISTS modules_format_chk;
ALTER TABLE modules ADD CONSTRAINT modules_format_chk CHECK (format IN ('ELEARN','INPERSON','ONLINE','OJT','VOC'));

-- OJT-ийн даалгавар, VoC-ийн шалгуур
CREATE TABLE IF NOT EXISTS module_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id  uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  position   int  NOT NULL,
  text       text NOT NULL
);

-- OJT/VoC-ийн бүртгэл: суралцагчийн тэмдэглэл, үнэлэгчийн шийдвэр
CREATE TABLE IF NOT EXISTS practical_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id    uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_key   text NOT NULL,
  mver         int  NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('OJT','VOC')),
  status       text NOT NULL CHECK (status IN ('IN_PROGRESS','SUBMITTED','REQUESTED','COMPETENT','NYC')),
  items        jsonb NOT NULL DEFAULT '[]',   -- [{text, done, note, at, result}]
  comments     text NOT NULL DEFAULT '',
  assessor_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  assessed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS practical_user_idx ON practical_records(user_id, course_id, module_key);

-- Train the Trainer: аль сургалтыг заах/үнэлэх эрх олгох
CREATE TABLE IF NOT EXISTS course_trainer_targets (
  course_id         uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  target_course_id  uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, target_course_id)
);

CREATE TABLE IF NOT EXISTS trainer_quals (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  source      text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('TTT','MANUAL')),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, course_id)
);

-- ===== Сургалтын төрөл: цахим, онлайн, танхимыг тус тусад нь =====
-- Хуучин "Ердийн сургалт"-ыг модулиудын хэлбэрээр нь ангилна
UPDATE courses c SET category = CASE
  WHEN NOT EXISTS (SELECT 1 FROM course_versions v JOIN modules m ON m.version_id=v.id WHERE v.course_id=c.id AND m.format<>'ELEARN') THEN 'ELEARN'
  WHEN NOT EXISTS (SELECT 1 FROM course_versions v JOIN modules m ON m.version_id=v.id WHERE v.course_id=c.id AND m.format<>'INPERSON') THEN 'INPERSON'
  WHEN NOT EXISTS (SELECT 1 FROM course_versions v JOIN modules m ON m.version_id=v.id WHERE v.course_id=c.id AND m.format<>'ONLINE') THEN 'ONLINE'
  ELSE 'BLENDED' END
 WHERE category='STANDARD';
ALTER TABLE courses ADD CONSTRAINT courses_category_chk CHECK (category IN ('ELEARN','ONLINE','INPERSON','BLENDED','OJT','VOC','TTT'));

-- ===== Албан тушаал, сургалтын матриц, албан тушаалын түүх =====
CREATE TABLE IF NOT EXISTS positions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  department  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO positions (name, department)
  SELECT DISTINCT ON (u.position) u.position, u.department FROM users u JOIN orgs o ON o.id=u.org_id
   WHERE o.is_internal AND u.position IS NOT NULL AND u.position <> '' ORDER BY u.position
ON CONFLICT (name) DO NOTHING;

-- Одоогийн албан тушаалд орсон огноо: заавал хамрагдах сургалтын хугацааг эндээс тоолно
ALTER TABLE users ADD COLUMN IF NOT EXISTS position_since timestamptz;
UPDATE users SET position_since = created_at WHERE position_since IS NULL;
ALTER TABLE users ALTER COLUMN position_since SET DEFAULT now();

-- Албан тушаалын түүх: өмнөх албан тушаал дээрээ суусан сургалтыг харахад
CREATE TABLE IF NOT EXISTS user_positions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position    text,
  department  text,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz
);
CREATE INDEX IF NOT EXISTS user_positions_user_idx ON user_positions(user_id, started_at);
INSERT INTO user_positions (user_id, position, department, started_at)
  SELECT u.id, u.position, u.department, u.position_since FROM users u
   WHERE u.role <> 'ADMIN' AND NOT EXISTS (SELECT 1 FROM user_positions p WHERE p.user_id=u.id);

-- Матрицаар үүссэн оноолтыг гараар үүсгэснээс ялгана
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MANUAL';

-- ===== Гэрчилгээ =====
CREATE SEQUENCE IF NOT EXISTS certificate_seq;
CREATE TABLE IF NOT EXISTS certificates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number       text NOT NULL UNIQUE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id    uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  version      int  NOT NULL,
  course_title text NOT NULL,
  category     text NOT NULL,
  user_name    text NOT NULL,
  org_name     text,
  position     text,
  department   text,
  mandatory    boolean NOT NULL DEFAULT false,
  issued_at    timestamptz NOT NULL DEFAULT now(),
  valid_until  timestamptz,
  revoked      boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS certificates_user_idx ON certificates(user_id, issued_at DESC);

-- ===== Шалгалтын материал: бүлэг, асуултын төрөл, онооны шатлал, гараар шалгах =====
ALTER TABLE exams ADD COLUMN IF NOT EXISTS num serial;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';          -- ACTIVE / HIDDEN
ALTER TABLE exams ADD COLUMN IF NOT EXISTS check_mode text NOT NULL DEFAULT 'AUTO';        -- AUTO / MANUAL
ALTER TABLE exams ADD COLUMN IF NOT EXISTS show_result text NOT NULL DEFAULT 'NOW';        -- NOW / LATER
ALTER TABLE exams ADD COLUMN IF NOT EXISTS attempts_allowed int NOT NULL DEFAULT 1;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS eval_template_id uuid REFERENCES eval_templates(id) ON DELETE SET NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS file_id uuid REFERENCES files(id) ON DELETE SET NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Бүлэг: тухайн бүлгээс санамсаргүйгээр draw_count асуулт сонгоно (0 = бүгд)
CREATE TABLE IF NOT EXISTS exam_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id      uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  position     int  NOT NULL,
  draw_count   int  NOT NULL DEFAULT 0,
  description  text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS exam_sections_exam_idx ON exam_sections(exam_id, position);

ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES exam_sections(id) ON DELETE CASCADE;
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS qtype text NOT NULL DEFAULT 'RADIO';   -- RADIO CHECKBOX SELECT TEXT TEXTAREA YESNO
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS correct jsonb;                          -- зөв хариултын дугаарууд [0,2]
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS image_file uuid REFERENCES files(id) ON DELETE SET NULL;
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS points int NOT NULL DEFAULT 1;
ALTER TABLE exam_questions ALTER COLUMN variant_id DROP NOT NULL;
ALTER TABLE exam_questions ALTER COLUMN correct_index DROP NOT NULL;
UPDATE exam_questions SET correct = jsonb_build_array(correct_index) WHERE correct IS NULL AND correct_index IS NOT NULL;

-- Хуучин "хувилбар"-ыг бүлэг болгоно: хувилбар бүрийн N-р асуултууд нэг бүлэгт орж, тэндээс 1-ийг сонгоно
DO $$
DECLARE e record; p int; sid uuid;
BEGIN
  FOR e IN SELECT DISTINCT v.exam_id FROM exam_variants v JOIN exam_questions q ON q.variant_id=v.id WHERE q.section_id IS NULL LOOP
    FOR p IN SELECT DISTINCT q.position FROM exam_questions q JOIN exam_variants v ON v.id=q.variant_id
              WHERE v.exam_id=e.exam_id AND q.section_id IS NULL ORDER BY 1 LOOP
      INSERT INTO exam_sections (exam_id, position, draw_count)
        VALUES (e.exam_id, (SELECT coalesce(max(position),0)+1 FROM exam_sections WHERE exam_id=e.exam_id), 1) RETURNING id INTO sid;
      UPDATE exam_questions q SET section_id=sid FROM exam_variants v
       WHERE v.id=q.variant_id AND v.exam_id=e.exam_id AND q.position=p AND q.section_id IS NULL;
    END LOOP;
  END LOOP;
END $$;

-- Онооны шатлал: авсан оноо (min..max) → дүн (жишээ нь Competent / Not yet competent)
CREATE TABLE IF NOT EXISTS exam_bands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  min_points  numeric NOT NULL,
  max_points  numeric NOT NULL,
  label       text NOT NULL,
  passed      boolean NOT NULL DEFAULT false
);

ALTER TABLE exam_attempts ALTER COLUMN variant_id DROP NOT NULL;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS attempt_no int NOT NULL DEFAULT 1;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS points numeric;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS max_points numeric;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS result_label text;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'NONE';   -- NONE / PENDING / DONE
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS marks jsonb;                                   -- асуулт бүрийн авсан оноо
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE exam_attempts DROP CONSTRAINT IF EXISTS exam_attempts_run_id_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS exam_attempts_run_user_no ON exam_attempts(run_id, user_id, attempt_no);
