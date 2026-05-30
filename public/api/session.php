<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/app.php';

try {
    $method = budget_require_method(['GET', 'POST', 'DELETE']);

    if ($method === 'GET') {
        budget_start_session();
        budget_json_response([
            'logged_in' => budget_is_admin(),
            'csrf_token' => budget_csrf_token(),
        ]);
    }

    if ($method === 'POST') {
        budget_start_session();
        budget_require_csrf();
        $data = budget_request_data();
        $password = isset($data['password']) && is_scalar($data['password']) ? (string)$data['password'] : '';
        $hash = budget_config()['admin_password_hash'] ?? '';

        if (!is_string($hash) || $hash === '' || !password_verify($password, $hash)) {
            budget_json_error('Password is incorrect.', 401);
        }

        session_regenerate_id(true);
        $_SESSION['budget_admin_authenticated'] = true;
        $_SESSION['budget_csrf_token'] = bin2hex(random_bytes(32));

        budget_json_response([
            'logged_in' => true,
            'csrf_token' => $_SESSION['budget_csrf_token'],
        ]);
    }

    budget_start_session();
    budget_require_csrf();
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'] ?? '/',
            'domain' => $params['domain'] ?? '',
            'secure' => (bool)($params['secure'] ?? true),
            'httponly' => (bool)($params['httponly'] ?? true),
            'samesite' => $params['samesite'] ?? 'Lax',
        ]);
    }

    session_destroy();
    budget_json_response(['logged_in' => false]);
} catch (Throwable $exception) {
    budget_handle_exception($exception);
}
