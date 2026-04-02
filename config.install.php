<?php
include("config.php");
include("config.bdd.php");

function exec_ignore($pdo, $query)
{
    try {
        $pdo->query($query);
        return true;
    } catch (Exception $e) {
        return false;
    }
}

try
{
    echo "Connection to database...<br>";
    $pdo_options = array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION);
    $bdd = new PDO($site_bdd, $site_bdd_user, $site_bdd_pass, $pdo_options);

    $tableTables = $site_bdd_prefix."tables";
    $tableCards = $site_bdd_prefix."cards";
    $tablePresence = $site_bdd_prefix."presence";

    echo "Creating table: '".$tableTables."'...<br>";
    $bdd->query(
        "CREATE TABLE IF NOT EXISTS `".$site_bdd_name."`.".$tableTables." (\n"
        ."`id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,\n"
        ."`room_code` VARCHAR(24) NOT NULL,\n"
        ."`status` INT(11) NOT NULL DEFAULT '0',\n"
        ."`date` DATETIME NULL DEFAULT NULL,\n"
        ."`timeout` INT(11) NOT NULL DEFAULT '60',\n"
        ."`suite` VARCHAR(30) NOT NULL DEFAULT 'fibonacci2',\n"
        ."`theme` VARCHAR(30) NOT NULL DEFAULT '',\n"
        ."`anonymous` BOOLEAN NOT NULL DEFAULT FALSE,\n"
        ."`version` BIGINT NOT NULL DEFAULT '1',\n"
        ."`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
        ."`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
        ."UNIQUE KEY `uniq_room_code` (`room_code`)\n"
        .") ENGINE=InnoDB;"
    );

    echo "Creating table: '".$tableCards."'...<br>";
    $bdd->query(
        "CREATE TABLE IF NOT EXISTS `".$site_bdd_name."`.".$tableCards." (\n"
        ."`id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,\n"
        ."`room_id` INT(11) NOT NULL,\n"
        ."`owner` VARCHAR(50) NOT NULL,\n"
        ."`value` INT(11) NOT NULL,\n"
        ."`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
        ."UNIQUE KEY `uniq_room_owner` (`room_id`, `owner`),\n"
        ."KEY `idx_room_id` (`room_id`)\n"
        .") ENGINE=InnoDB;"
    );

    echo "Creating table: '".$tablePresence."'...<br>";
    $bdd->query(
        "CREATE TABLE IF NOT EXISTS `".$site_bdd_name."`.".$tablePresence." (\n"
        ."`id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,\n"
        ."`room_id` INT(11) NOT NULL,\n"
        ."`owner` VARCHAR(50) NOT NULL,\n"
        ."`last_seen` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n"
        ."UNIQUE KEY `uniq_presence_room_owner` (`room_id`, `owner`),\n"
        ."KEY `idx_presence_room` (`room_id`),\n"
        ."KEY `idx_presence_last_seen` (`last_seen`)\n"
        .") ENGINE=InnoDB;"
    );

    /* Best-effort migration for old installations */
    exec_ignore($bdd, "ALTER TABLE `".$site_bdd_name."`.".$tableTables." ADD COLUMN `room_code` VARCHAR(24) NOT NULL DEFAULT '' AFTER `id`");
    exec_ignore($bdd, "ALTER TABLE `".$site_bdd_name."`.".$tableTables." ADD COLUMN `version` BIGINT NOT NULL DEFAULT '1' AFTER `anonymous`");
    exec_ignore($bdd, "ALTER TABLE `".$site_bdd_name."`.".$tableTables." ADD COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `version`");
    exec_ignore($bdd, "ALTER TABLE `".$site_bdd_name."`.".$tableTables." ADD COLUMN `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`");
    exec_ignore($bdd, "ALTER TABLE `".$site_bdd_name."`.".$tableTables." ADD UNIQUE KEY `uniq_room_code` (`room_code`)");

    exec_ignore($bdd, "ALTER TABLE `".$site_bdd_name."`.".$tableCards." ADD COLUMN `room_id` INT(11) NOT NULL DEFAULT '0' AFTER `id`");
    exec_ignore($bdd, "ALTER TABLE `".$site_bdd_name."`.".$tableCards." ADD COLUMN `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `value`");
    exec_ignore($bdd, "ALTER TABLE `".$site_bdd_name."`.".$tableCards." ADD UNIQUE KEY `uniq_room_owner` (`room_id`, `owner`)");
    exec_ignore($bdd, "ALTER TABLE `".$site_bdd_name."`.".$tableCards." ADD KEY `idx_room_id` (`room_id`)");

    exec_ignore($bdd, "CREATE TABLE IF NOT EXISTS `".$site_bdd_name."`.".$tablePresence." (`id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY, `room_id` INT(11) NOT NULL, `owner` VARCHAR(50) NOT NULL, `last_seen` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY `uniq_presence_room_owner` (`room_id`, `owner`), KEY `idx_presence_room` (`room_id`), KEY `idx_presence_last_seen` (`last_seen`)) ENGINE=InnoDB");
    exec_ignore($bdd, "ALTER TABLE `".$site_bdd_name."`.".$tablePresence." ADD UNIQUE KEY `uniq_presence_room_owner` (`room_id`, `owner`)");
    exec_ignore($bdd, "ALTER TABLE `".$site_bdd_name."`.".$tablePresence." ADD KEY `idx_presence_room` (`room_id`)");
    exec_ignore($bdd, "ALTER TABLE `".$site_bdd_name."`.".$tablePresence." ADD KEY `idx_presence_last_seen` (`last_seen`)");

    /* Legacy support: fill room_code and room_id when previous schema existed */
    exec_ignore($bdd, "UPDATE `".$site_bdd_name."`.".$tableTables." SET `room_code`=CONCAT('LEGACY_', `id`) WHERE `room_code`=''");
    exec_ignore($bdd, "UPDATE `".$site_bdd_name."`.".$tableCards." c JOIN `".$site_bdd_name."`.".$tableTables." t ON c.`table`=t.`id` SET c.`room_id`=t.`id` WHERE c.`room_id`=0");

    $bdd = null;
    echo "Everything goes right !!!<br>Note that for your security you should delete this file or rename it from your server.";
}
catch (Exception $e)
{
    die($e->getMessage());
}

?>
