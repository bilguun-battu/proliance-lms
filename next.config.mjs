/** @type {import('next').NextConfig} */
// proliance.mn/surgalt гэх мэт дэд хаяг дээр байршуулах бол NEXT_PUBLIC_BASE_PATH=/surgalt гэж тохируулна.
const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
      // Прокси ард (GitHub Codespaces гэх мэт) ажиллахад зөвшөөрөх хаягууд, таслалаар: *.app.github.dev
      allowedOrigins: process.env.SERVER_ACTIONS_ORIGINS ? process.env.SERVER_ACTIONS_ORIGINS.split(',').map(s => s.trim()) : undefined,
    },
    serverComponentsExternalPackages: ['pg', 'exceljs', 'nodemailer', 'bcryptjs'],
  },
};
export default nextConfig;
