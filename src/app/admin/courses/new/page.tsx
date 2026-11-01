import { all } from '@/lib/db';
import { createCourse } from '@/app/actions/admin';
import { Flash } from '@/components/ui';
import Submit from '@/components/Submit';
import CourseSetupFields from '@/components/CourseSetupFields';

export default async function NewCourse(
  props: { searchParams: Promise<{ ok?: string; err?: string; aud?: string }> }
) {
  const searchParams = await props.searchParams;
  const products = await all<any>('SELECT id, code, name FROM products ORDER BY code');
  const courses = await all<any>('SELECT id, title, audience FROM courses ORDER BY audience, title');
  return (
    <>
      <div className="head"><h1>Шинэ сургалт</h1></div>
      <Flash sp={searchParams} />
      <form action={createCourse} className="panel" encType="multipart/form-data">
        <div className="form">
          <label className="fld full"><span>Сургалтын нэр</span><input type="text" name="title" required /></label>
          <label className="fld full"><span>Тайлбар</span><textarea name="description" /></label>
          <label className="fld full"><span>Нүүр зураг (суралцагчийн картанд, PNG/JPG/WebP, 5MB хүртэл, 16:9 харьцаатай зураг тохиромжтой)</span><input type="file" name="cover" accept="image/png,image/jpeg,image/webp" /></label>
          <label className="fld"><span>Шинэчлэлтийг үзэх хугацаа (хоног)</span><input type="number" name="due_days" defaultValue={30} min={1} /></label>
          <label className="checks"><label><input type="checkbox" name="sequential" /> Модулиудыг дарааллаар нээх</label></label>
          <CourseSetupFields products={products} courses={courses} audience={searchParams.aud === 'internal' ? 'INTERNAL' : 'CUSTOMER'} />
        </div>
        <div><Submit>Үүсгээд модуль нэмэх</Submit></div>
      </form>
    </>
  );
}
