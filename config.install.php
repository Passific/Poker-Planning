<?php
include("config.php");
include("config.bdd.php");

try
{
	// Config and DB connection
	echo "Connection to database...<br>";
	$pdo_options[PDO::ATTR_ERRMODE] = PDO::ERRMODE_EXCEPTION;
	$bdd = new PDO($site_bdd, $site_bdd_user, $site_bdd_pass, $pdo_options);

	// Create the data base for storing users
//~ 	$Table=$site_bdd_prefix."users";
//~ 	echo "Creating table: '$Table'...<br>";
//~ 	$bdd->query("CREATE TABLE IF NOT EXISTS `".$site_bdd_name."`.".$Table." (`id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY, `user` VARCHAR(50) NOT NULL, UNIQUE(`user`), `password` VARCHAR(255) NOT NULL, `name` VARCHAR(50) NOT NULL, `mail` VARCHAR(255)) ENGINE = MYISAM;");

	// Create the data base for tables
	$Table=$site_bdd_prefix."tables";
	echo "Creating table: '$Table'...<br>";
	$bdd->query("CREATE TABLE IF NOT EXISTS `".$site_bdd_name."`.".$Table." (`id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY, `status` INT(11), `date` DATETIME, `timeout` INT(11) NOT NULL DEFAULT '60', `suite` VARCHAR(30), `theme` VARCHAR(30)) ENGINE = MYISAM;");

	// Create the data base for cards
	$Table=$site_bdd_prefix."cards";
	echo "Creating table: '$Table'...<br>";
	$bdd->query("CREATE TABLE IF NOT EXISTS `".$site_bdd_name."`.".$Table." (`id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY, `value` INT(11), `table` INT(11), `owner` VARCHAR(50) NOT NULL) ENGINE = MYISAM;");

	// Clean and success
	$bdd=NULL;
	echo "Everything goes right !!!<br>Note that for your security you should delete this file or rename it from your server.";
}
catch (Exception $e)
{
	die($e->getMessage());
	//die('Oups...');
	echo "<br><br>Did you set correctly the configuration file : <b>config.bdd.php</b> ?";
}

?>
