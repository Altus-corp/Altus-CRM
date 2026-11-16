# cPanel CDN attachment receiver

The CRM is ready to request a five-minute, lead-specific upload permission and
then upload files directly to cPanel. This avoids proxying large media through
Vercel and keeps the permanent signing secret out of the browser.

## 1. Upload the PHP receiver

Upload `docs/cpanel-cdn-upload.php` to cPanel as, for example,
`public_html/api/crm-upload.php`. Before using it, change these two values in
that file to match the cPanel account:

```php
$uploadDirectory = __DIR__ . '/../uploads/lead-attachments';
$publicBaseUrl = 'https://cdn.productivityshastra.com/uploads/lead-attachments';
```

The `uploads` directory must be served by `cdn.productivityshastra.com` and
must be writable by the cPanel PHP process. Do not allow directory listing or
PHP execution inside that uploads folder.

## 2. Set the shared secret on cPanel

Create a long random value and expose it to PHP as
`CDN_UPLOAD_SIGNING_SECRET`. If the host does not support PHP environment
variables, place the value in a PHP configuration file **outside**
`public_html`, then require that file from the receiver. Never put this value
in JavaScript or a public web folder.

## 3. Set Vercel environment variables

Add these in Vercel for Production, Preview, and Development as appropriate:

```env
CDN_UPLOAD_URL=https://cdn.productivityshastra.com/api/crm-upload.php
CDN_UPLOAD_SIGNING_SECRET=the-exact-same-private-value-as-cpanel
CDN_PUBLIC_BASE_URL=https://cdn.productivityshastra.com/uploads/lead-attachments
```

Redeploy after adding them. Do not prefix any of these names with
`NEXT_PUBLIC_`.

## 4. Confirm the allowed CRM origins

The receiver allows `https://crm.altuscorp.in` and local development at
`http://localhost:3000`. Update `$allowedOrigins` in the PHP file if the CRM
uses another domain. The direct browser upload depends on this CORS allowlist.

## Limits and accepted files

The CRM and receiver accept one file up to 100 MB: PDF, image, audio, video,
text/CSV, and Word/Excel/PowerPoint documents. cPanel's `upload_max_filesize`
and `post_max_size` must each be at least `100M` for the stated limit.
