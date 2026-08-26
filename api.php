<?php
include("config.php");
include("config.bdd.php");

session_start();

date_default_timezone_set("Europe/Paris");
header("Server: Passific");
header("X-Powered-By: Passific");
header("Content-Type: application/json; charset=utf-8");
header("X-Content-Type-Options: nosniff");
header("Cache-Control: no-store");
header("X-Frame-Options: DENY");
header("Strict-Transport-Security: max-age=31536000; includeSubDomains");
header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'");

const DEFAULT_TIMEOUT = 60;
const DEFAULT_SUITE = "fibonacci2";
const EMPTY_DATE = "0000-00-00 00:00:00";
const PRESENCE_TTL_SECONDS = 120;
const RATE_LIMIT_REQUESTS = 180;
const RATE_LIMIT_WINDOW_SECONDS = 60;

$pdo = null;

function send_json($payload)
{
    echo json_encode($payload);
    exit;
}

function get_csrf_token()
{
    if (!isset($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function validate_csrf_token($token)
{
    return isset($_SESSION['csrf_token']) && hash_equals($_SESSION['csrf_token'], $token);
}

function check_rate_limit()
{
    $client_ip = $_SERVER['REMOTE_ADDR'];
    $rate_limit_key = 'rate_limit_' . $client_ip;

    if (!isset($_SESSION[$rate_limit_key])) {
        $_SESSION[$rate_limit_key] = array();
    }

    $now = time();
    $requests = $_SESSION[$rate_limit_key];

    /* Remove old requests outside the window */
    $requests = array_filter($requests, function($timestamp) use ($now) {
        return ($now - $timestamp) < RATE_LIMIT_WINDOW_SECONDS;
    });

    if (count($requests) >= RATE_LIMIT_REQUESTS) {
        return false;
    }

    $requests[] = $now;
    $_SESSION[$rate_limit_key] = $requests;
    return true;
}

function get_pdo()
{
    global $pdo, $site_bdd, $site_bdd_user, $site_bdd_pass;

    if (null !== $pdo) {
        return $pdo;
    }

    $pdo = new PDO(
        $site_bdd,
        $site_bdd_user,
        $site_bdd_pass,
        array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC)
    );
    return $pdo;
}

function exec_stmt($sql, $params = array())
{
    $stmt = get_pdo()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function sanitize_room($room)
{
    $room = strtoupper(trim((string)$room));
    $room = preg_replace('/ /', '_', $room);
    $room = preg_replace('/[^A-Z0-9_-]/', '', $room);
    if (strlen($room) > 24) {
        $room = substr($room, 0, 24);
    }
    return $room;
}

function sanitize_owner($owner)
{
    $owner = trim((string)$owner);
    $owner = preg_replace('/[\x00-\x1f\x7f]/u', '', $owner); /* strip null bytes and control characters */
    $owner = preg_replace('/\s+/', ' ', $owner);
    if (strlen($owner) > 50) {
        $owner = substr($owner, 0, 50);
    }
    return $owner;
}

function generate_room_code($length = 8)
{
    $alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    $maxIndex = strlen($alphabet) - 1;
    $code = "";
    for ($i = 0; $i < $length; $i++) {
        $code .= $alphabet[random_int(0, $maxIndex)];
    }
    return $code;
}

function get_room_row($roomCode)
{
    global $site_bdd_prefix;
    $stmt = exec_stmt(
        "SELECT * FROM `".$site_bdd_prefix."tables` WHERE `room_code`=:room_code LIMIT 1",
        array(':room_code' => $roomCode)
    );
    return $stmt->fetch();
}

function room_exists($roomCode)
{
    return false !== get_room_row($roomCode);
}

function create_room($requestedCode = "")
{
    global $site_bdd_prefix;

    $roomCode = sanitize_room($requestedCode);
    if ("" !== $roomCode) {
        if (room_exists($roomCode)) {
            return array('result' => false, 'error' => 'room_exists');
        }
    }

    if ("" === $roomCode) {
        for ($i = 0; $i < 20; $i++) {
            $candidate = generate_room_code();
            if (!room_exists($candidate)) {
                $roomCode = $candidate;
                break;
            }
        }
    }

    if ("" === $roomCode) {
        return array('result' => false, 'error' => 'room_generation_failed');
    }

    try {
        exec_stmt(
            "INSERT INTO `".$site_bdd_prefix."tables` (`room_code`, `status`, `date`, `timeout`, `suite`, `theme`, `anonymous`, `version`, `created_at`, `updated_at`)\n         VALUES (:room_code, 0, NULL, :timeout, :suite, '', 0, 1, NOW(), NOW())",
            array(':room_code' => $roomCode, ':timeout' => DEFAULT_TIMEOUT, ':suite' => DEFAULT_SUITE)
        );
    } catch (PDOException $e) {
        if ('23000' === $e->getCode()) {
            return array('result' => false, 'error' => 'room_exists');
        }
        throw $e;
    }

    return array('result' => true, 'room' => $roomCode);
}

function get_room_id($roomCode)
{
    $row = get_room_row($roomCode);
    if (false === $row) {
        return null;
    }
    return intval($row['id']);
}

function table_touch_update($roomCode, $setClause, $params)
{
    global $site_bdd_prefix;

    $params[':room_code'] = $roomCode;
    exec_stmt(
        "UPDATE `".$site_bdd_prefix."tables` SET ".$setClause.", `version`=`version`+1, `updated_at`=NOW() WHERE `room_code`=:room_code",
        $params
    );

    return true;
}

function touch_presence($roomId, $owner)
{
    global $site_bdd_prefix;

    if ("" === $owner) {
        return;
    }

    exec_stmt(
        "INSERT INTO `".$site_bdd_prefix."presence` (`room_id`, `owner`, `last_seen`)\n         VALUES (:room_id, :owner, NOW())\n         ON DUPLICATE KEY UPDATE `last_seen`=NOW()",
        array(':room_id' => $roomId, ':owner' => $owner)
    );
}

function get_participants($roomId)
{
    global $site_bdd_prefix;

    $stmt = exec_stmt(
        "SELECT p.`owner`, p.`last_seen`, c.`id` AS `card_id` FROM `".$site_bdd_prefix."presence` p LEFT JOIN `".$site_bdd_prefix."cards` c ON c.`room_id`=p.`room_id` AND c.`owner`=p.`owner` WHERE p.`room_id`=:room_id ORDER BY p.`owner` ASC",
        array(':room_id' => $roomId)
    );

    $participants = array();
    while ($row = $stmt->fetch()) {
        $lastSeenTs = strtotime($row['last_seen']);
        $connected = false;
        if (false !== $lastSeenTs) {
            $connected = (time() - $lastSeenTs) <= PRESENCE_TTL_SECONDS;
        }

        $participants[] = array(
            'owner' => $row['owner'],
            'voted' => (null !== $row['card_id']),
            'connected' => $connected,
            'last_seen' => $row['last_seen']
        );
    }

    return $participants;
}

function get_table_state($roomCode, $sinceVersion, $owner)
{
    global $site_bdd_prefix;

    $table = get_room_row($roomCode);
    if (false === $table) {
        return array('result' => false, 'exists' => false);
    }

    $roomId = intval($table['id']);
    touch_presence($roomId, $owner);

    /* Keep presence table compact over time (~1% of requests) */
    if (mt_rand(0, 99) === 0) {
        exec_stmt(
            "DELETE FROM `".$site_bdd_prefix."presence` WHERE `last_seen` < (NOW() - INTERVAL 60 DAY)"
        );
    }

    $participants = get_participants($roomId);

    $currentVersion = intval($table['version']);
    if ($sinceVersion >= $currentVersion) {
        return array(
            'result' => true,
            'exists' => true,
            'changed' => false,
            'version' => $currentVersion,
            'status' => strval($table['status']),
            'date' => (null === $table['date']) ? EMPTY_DATE : $table['date'],
            'timeout' => intval($table['timeout']),
            'suite' => (string)$table['suite'],
            'theme' => (string)$table['theme'],
            'anonymous' => ('1' === strval($table['anonymous'])),
            'data' => array(),
            'participants' => $participants
        );
    }

    $stmt = exec_stmt(
        "SELECT `id`, `value`, `owner` FROM `".$site_bdd_prefix."cards` WHERE `room_id`=:room_id ORDER BY `owner` ASC",
        array(':room_id' => $roomId)
    );

    $isRevealed = (1 === intval($table['status']));
    $cards = array();
    while ($row = $stmt->fetch()) {
        $cards[] = array(
            'id' => intval($row['id']),
            'value' => $isRevealed ? intval($row['value']) : 0,
            'owner' => $row['owner']
        );
    }

    return array(
        'result' => true,
        'exists' => true,
        'changed' => true,
        'version' => $currentVersion,
        'status' => strval($table['status']),
        'date' => (null === $table['date']) ? EMPTY_DATE : $table['date'],
        'timeout' => intval($table['timeout']),
        'suite' => (string)$table['suite'],
        'theme' => (string)$table['theme'],
        'anonymous' => ('1' === strval($table['anonymous'])),
        'data' => $cards,
        'participants' => $participants
    );
}

try {
    /* Rate limit check */
    if (!check_rate_limit()) {
        send_json(array('result' => false, 'error' => 'rate_limit_exceeded'));
    }

    $action = isset($_POST['a']) ? $_POST['a'] : (isset($_GET['a']) ? $_GET['a'] : "");
    $owner = sanitize_owner(isset($_POST['p']) ? $_POST['p'] : (isset($_GET['p']) ? $_GET['p'] : ""));
    $value = isset($_POST['v']) ? intval($_POST['v']) : (isset($_GET['v']) ? intval($_GET['v']) : 0);
    $room = sanitize_room(isset($_POST['room']) ? $_POST['room'] : (isset($_GET['room']) ? $_GET['room'] : ""));
    $since = isset($_POST['since']) ? intval($_POST['since']) : (isset($_GET['since']) ? intval($_GET['since']) : -1);
    $csrf_token = isset($_POST['csrf']) ? $_POST['csrf'] : (isset($_GET['csrf']) ? $_GET['csrf'] : "");

    switch ($action) {
        case 'get_token': {
            send_json(array('result' => true, 'csrf' => get_csrf_token()));
            break;
        }

        case 'create_room': {
            if ('POST' !== $_SERVER['REQUEST_METHOD'] || !validate_csrf_token($csrf_token)) {
                send_json(array('result' => false, 'error' => 'invalid_request'));
            }
            $result = create_room($room);
            $result['csrf'] = get_csrf_token();
            send_json($result);
            break;
        }

        case 'room_exists': {
            if ("" === $room) {
                send_json(array('result' => false, 'exists' => false, 'error' => 'missing_room'));
            }
            send_json(array('result' => true, 'exists' => room_exists($room)));
            break;
        }

        case 'get': {
            if ("" === $room) {
                send_json(array('result' => false, 'exists' => false, 'error' => 'missing_room'));
            }
            send_json(get_table_state($room, $since, $owner));
            break;
        }

        case 'select':
        case 'update': {
            if ('POST' !== $_SERVER['REQUEST_METHOD'] || !validate_csrf_token($csrf_token)) {
                send_json(array('result' => false, 'error' => 'invalid_request'));
            }
            if ("" === $room || "" === $owner || $value <= 0 || $value > 200) {
                send_json(array('result' => false, 'error' => 'invalid_input'));
            }

            $roomId = get_room_id($room);
            if (null === $roomId) {
                send_json(array('result' => false, 'error' => 'room_not_found'));
            }

            touch_presence($roomId, $owner);

            exec_stmt(
                "INSERT INTO `".$site_bdd_prefix."cards` (`room_id`, `owner`, `value`, `updated_at`)\n                 VALUES (:room_id, :owner, :value, NOW())\n                 ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), `updated_at`=NOW()",
                array(':room_id' => $roomId, ':owner' => $owner, ':value' => $value)
            );

            table_touch_update($room, "`status`=0, `date`=IF(`date` IS NULL, NOW(), `date`)", array());
            send_json(array('result' => true, 'csrf' => get_csrf_token()));
            break;
        }

        case 'reset': {
            if ('POST' !== $_SERVER['REQUEST_METHOD'] || !validate_csrf_token($csrf_token)) {
                send_json(array('result' => false, 'error' => 'invalid_request'));
            }
            if ("" === $room) {
                send_json(array('result' => false, 'error' => 'missing_room'));
            }

            $roomId = get_room_id($room);
            if (null === $roomId) {
                send_json(array('result' => false, 'error' => 'room_not_found'));
            }

            exec_stmt("DELETE FROM `".$site_bdd_prefix."cards` WHERE `room_id`=:room_id", array(':room_id' => $roomId));
            table_touch_update($room, "`status`=2, `date`=NULL", array());
            send_json(array('result' => true, 'csrf' => get_csrf_token()));
            break;
        }

        case 'reveal': {
            if ('POST' !== $_SERVER['REQUEST_METHOD'] || !validate_csrf_token($csrf_token)) {
                send_json(array('result' => false, 'error' => 'invalid_request'));
            }
            if ("" === $room) {
                send_json(array('result' => false, 'error' => 'missing_room'));
            }
            table_touch_update($room, "`status`=1, `date`=NULL", array());
            send_json(array('result' => true, 'csrf' => get_csrf_token()));
            break;
        }

        case 'timeout': {
            if ('POST' !== $_SERVER['REQUEST_METHOD'] || !validate_csrf_token($csrf_token)) {
                send_json(array('result' => false, 'error' => 'invalid_request'));
            }
            if ("" === $room || $value <= 0 || $value > 3600) {
                send_json(array('result' => false, 'error' => 'invalid_input'));
            }
            table_touch_update($room, "`timeout`=:timeout, `date`=NULL", array(':timeout' => $value));
            send_json(array('result' => true, 'csrf' => get_csrf_token()));
            break;
        }

        case 'suite': {
            if ('POST' !== $_SERVER['REQUEST_METHOD'] || !validate_csrf_token($csrf_token)) {
                send_json(array('result' => false, 'error' => 'invalid_request'));
            }
            $suite = sanitize_room($owner);
            if ("" === $room || "" === $suite) {
                send_json(array('result' => false, 'error' => 'invalid_input'));
            }

            table_touch_update($room, "`suite`=:suite", array(':suite' => strtolower($suite)));

            $roomId = get_room_id($room);
            if (null !== $roomId) {
                exec_stmt("DELETE FROM `".$site_bdd_prefix."cards` WHERE `room_id`=:room_id", array(':room_id' => $roomId));
                table_touch_update($room, "`status`=2, `date`=NULL", array());
            }

            send_json(array('result' => true, 'csrf' => get_csrf_token()));
            break;
        }

        case 'anonymous': {
            if ('POST' !== $_SERVER['REQUEST_METHOD'] || !validate_csrf_token($csrf_token)) {
                send_json(array('result' => false, 'error' => 'invalid_request'));
            }
            if ("" === $room) {
                send_json(array('result' => false, 'error' => 'missing_room'));
            }
            table_touch_update($room, "`anonymous`=:anonymous", array(':anonymous' => (1 === $value ? 1 : 0)));

            $roomId = get_room_id($room);
            if (null !== $roomId) {
                exec_stmt("DELETE FROM `".$site_bdd_prefix."cards` WHERE `room_id`=:room_id", array(':room_id' => $roomId));
                table_touch_update($room, "`status`=2, `date`=NULL", array());
            }

            send_json(array('result' => true, 'csrf' => get_csrf_token()));
            break;
        }

        default:
            send_json(array('result' => false, 'error' => 'unknown_action'));
    }
} catch (Exception $e) {
    error_log($e->getMessage());
    send_json(array('result' => false, 'error' => 'server_error'));
}
