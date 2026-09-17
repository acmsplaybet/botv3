<?php
/**
 * APEX Database Date Match Counts Helper
 * Returns JSON mapping of match_date => total match count in APEX MySQL DB
 */
header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = new PDO('mysql:host=localhost;dbname=apex_db;charset=utf8mb4', 'root', '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 2
    ]);

    $sql = "SELECT match_date, count(*) as apex_total FROM matches GROUP BY match_date ORDER BY match_date DESC";
    $counts = [];
    foreach ($pdo->query($sql) as $row) {
        $counts[$row['match_date']] = (int)$row['apex_total'];
    }

    echo json_encode(['success' => true, 'counts' => $counts]);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
