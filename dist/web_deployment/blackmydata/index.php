<?php
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Julian Digital Products
declare(strict_types=1);
require __DIR__ . '/../gate/lib.php';
if (isset($_GET['asset'])) {
    $asset = basename($_GET['asset']);
    if ($asset === 'icon.svg' && is_file(__DIR__ . '/icon.svg')) {
        gate_check_asset($asset);
        header('Content-Type: image/svg+xml');
        header('Cache-Control: public, max-age=86400');
        readfile(__DIR__ . '/icon.svg');
        exit;
    }
}
gate_check_site();
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
readfile(__DIR__ . '/index.html');
exit;
