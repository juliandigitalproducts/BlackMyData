<?php
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Julian Digital Products
declare(strict_types=1);
// Entry point of a web app behind the AIO gate (/gate/). Copied as run/index.php into every app; the app id is
// the parent folder name (aiomm, blackmydata). Without a valid pass the visitor is sent to the check page. Every
// other file of the app is routed here as index.php?asset=<path> and delivered only with a valid pass.
if (PHP_VERSION_ID < 80100) {
    http_response_code(500);
    exit('aio-gate needs PHP 8.1 or newer');
}
require __DIR__ . '/../../gate/lib.php';
gate_entry_init();
gate_protect_app(basename(dirname(__DIR__)), __DIR__ . '/index.html');
