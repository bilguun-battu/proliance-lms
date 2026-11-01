/** @type {import('next').NextConfig} */
// proliance.mn/surgalt гэх мэт дэд хаяг дээр байршуулах бол NEXT_PUBLIC_BASE_PATH=/surgalt гэж тохируулна.
const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  experimental: {
    serverActions: { bodySizeLimit: '20mb' },
    serverComponentsExternalPackages: ['pg', 'exceljs', 'nodemailer', 'bcryptjs'],
  },
};
export default nextConfig;
