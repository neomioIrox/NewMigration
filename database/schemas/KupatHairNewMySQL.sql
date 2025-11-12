-- MySQL dump 10.13  Distrib 8.0.42, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: kupathairnew
-- ------------------------------------------------------
-- Server version	9.3.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `address`
--

DROP TABLE IF EXISTS `address`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `address` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Country` int NOT NULL,
  `City` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Street` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `Number` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `Entrance` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `Floor` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `ZipCode` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `Latitude` float DEFAULT NULL,
  `Longitude` float DEFAULT NULL,
  `Comments` varchar(1000) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_Address_C_LutCountry` (`Country`),
  CONSTRAINT `FK_Address_C_LutCountry` FOREIGN KEY (`Country`) REFERENCES `lutcountry` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `affiliate`
--

DROP TABLE IF EXISTS `affiliate`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `affiliate` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Name` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `DefaultSourceId` int DEFAULT NULL,
  `UserId` int DEFAULT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_Affiliate_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_Affiliate_SCB_User` (`StatusChangedBy`),
  KEY `FK_Affiliate_CB_User` (`CreatedBy`),
  KEY `FK_Affiliate_UB_User` (`UpdatedBy`),
  KEY `FK_Affiliate_Source` (`DefaultSourceId`),
  CONSTRAINT `FK_Affiliate_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Affiliate_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_Affiliate_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Affiliate_Source` FOREIGN KEY (`DefaultSourceId`) REFERENCES `source` (`Id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_Affiliate_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `banner`
--

DROP TABLE IF EXISTS `banner`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `banner` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Name` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Order` int DEFAULT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  `LinkSettingId` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_Banner_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_Banner_SCB_User` (`StatusChangedBy`),
  KEY `FK_Banner_CB_User` (`CreatedBy`),
  KEY `FK_Banner_UB_User` (`UpdatedBy`),
  KEY `FKBanner_Order` (`Order`),
  KEY `FK_Banner_LinkSetting` (`LinkSettingId`),
  CONSTRAINT `FK_Banner_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Banner_LinkSetting` FOREIGN KEY (`LinkSettingId`) REFERENCES `linksetting` (`Id`),
  CONSTRAINT `FK_Banner_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_Banner_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Banner_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FKBanner_Order` FOREIGN KEY (`Order`) REFERENCES `lutlistvieworder` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bannerlocalization`
--

DROP TABLE IF EXISTS `bannerlocalization`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bannerlocalization` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `BannerId` int NOT NULL,
  `Language` int NOT NULL,
  `MediaId` int NOT NULL,
  `MobileMediaId` int DEFAULT NULL,
  `DisplayInSite` tinyint(1) NOT NULL DEFAULT '0',
  `CreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_BannerLocalization_Banner` (`BannerId`),
  KEY `FK_BannerLocalization_Language` (`Language`),
  KEY `FK_BannerLocalization_MediaId` (`MediaId`),
  KEY `FK_BannerLocalization_MobileMediaId` (`MobileMediaId`),
  KEY `FK_BannerLocalization_CreatedBy` (`CreatedBy`),
  KEY `FK_BannerLocalization_UpdatedBy` (`UpdatedBy`),
  CONSTRAINT `FK_BannerLocalization_Banner` FOREIGN KEY (`BannerId`) REFERENCES `banner` (`Id`),
  CONSTRAINT `FK_BannerLocalization_CreatedBy` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_BannerLocalization_Language` FOREIGN KEY (`Language`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_BannerLocalization_MediaId` FOREIGN KEY (`MediaId`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_BannerLocalization_MobileMediaId` FOREIGN KEY (`MobileMediaId`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_BannerLocalization_UpdatedBy` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `branch`
--

DROP TABLE IF EXISTS `branch`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `branch` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Name` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Title` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `Description` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Phone` varchar(30) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  `AddressId` int DEFAULT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UK_Branch_Name` (`Name`),
  KEY `FK_Branch_CB_User` (`CreatedBy`),
  KEY `FK_Branch_UB_User` (`UpdatedBy`),
  KEY `FK_Branch_Address` (`AddressId`),
  CONSTRAINT `FK_Branch_Address` FOREIGN KEY (`AddressId`) REFERENCES `address` (`Id`),
  CONSTRAINT `FK_Branch_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Branch_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `captchaexclusion`
--

DROP TABLE IF EXISTS `captchaexclusion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `captchaexclusion` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `IP` varchar(200) COLLATE utf8mb4_general_ci NOT NULL,
  `ExclusionReason` int NOT NULL,
  `CreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_CaptchaExclusion_ExclusionReason` (`ExclusionReason`),
  KEY `FK_CaptchaExclusion_CreatedBy` (`CreatedBy`),
  KEY `FK_CaptchaExclusion_UpdatedBy` (`UpdatedBy`),
  CONSTRAINT `FK_CaptchaExclusion_CreatedBy` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_CaptchaExclusion_ExclusionReason` FOREIGN KEY (`ExclusionReason`) REFERENCES `lutrecaptchaexclusionreason` (`Id`),
  CONSTRAINT `FK_CaptchaExclusion_UpdatedBy` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clearingmethod`
--

DROP TABLE IF EXISTS `clearingmethod`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clearingmethod` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Name` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `ClearingMethodType` int NOT NULL,
  `MoreDetails` text,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  `SupportRecurringPayment` tinyint(1) DEFAULT NULL,
  `SupportInstallmentsPayment` tinyint(1) DEFAULT NULL,
  `SupportTokenTransaction` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_ClearingMethod_CMT_LutClearingMethodType` (`ClearingMethodType`),
  KEY `FK_ClearingMethod_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_ClearingMethod_SCB_User` (`StatusChangedBy`),
  KEY `FK_ClearingMethod_CB_User` (`CreatedBy`),
  KEY `FK_ClearingMethod_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_ClearingMethod_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ClearingMethod_CMT_LutClearingMethodType` FOREIGN KEY (`ClearingMethodType`) REFERENCES `lutclearingmethodtype` (`Id`),
  CONSTRAINT `FK_ClearingMethod_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_ClearingMethod_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ClearingMethod_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clearingmethodarea`
--

DROP TABLE IF EXISTS `clearingmethodarea`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clearingmethodarea` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `ClearingMethodId` int NOT NULL,
  `Area` int NOT NULL,
  `ReceiptBy` int NOT NULL,
  `MoreDetails` text COLLATE utf8mb4_general_ci,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  `SupportOnlyFirstPaymentForRecurringPayment` tinyint(1) NOT NULL DEFAULT '0',
  `SupportRecurringPayment` tinyint(1) DEFAULT NULL,
  `SupportInstallmentsPayment` tinyint(1) DEFAULT NULL,
  `SupportTokenTransaction` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_ClearingMethodArea_CMI_ClearingMethod` (`ClearingMethodId`),
  KEY `FK_ClearingMethodArea_A_LutClearingArea` (`Area`),
  KEY `FK_ClearingMethodArea_RB_LutReceiptProvider` (`ReceiptBy`),
  KEY `FK_ClearingMethodArea_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_ClearingMethodArea_SCB_User` (`StatusChangedBy`),
  KEY `FK_ClearingMethodArea_CB_User` (`CreatedBy`),
  KEY `FK_ClearingMethodArea_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_ClearingMethodArea_A_LutClearingArea` FOREIGN KEY (`Area`) REFERENCES `lutclearingarea` (`Id`),
  CONSTRAINT `FK_ClearingMethodArea_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ClearingMethodArea_CMI_ClearingMethod` FOREIGN KEY (`ClearingMethodId`) REFERENCES `clearingmethod` (`Id`),
  CONSTRAINT `FK_ClearingMethodArea_RB_LutReceiptProvider` FOREIGN KEY (`ReceiptBy`) REFERENCES `lutreceiptprovider` (`Id`),
  CONSTRAINT `FK_ClearingMethodArea_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_ClearingMethodArea_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ClearingMethodArea_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=44 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clearingmethodareaterminal`
--

DROP TABLE IF EXISTS `clearingmethodareaterminal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clearingmethodareaterminal` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `ClearingMethodAreaId` int NOT NULL,
  `ClearingMethodTerminalNum` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_ClearingMethodAreaTerminal_CMAI_ClearingMethodArea` (`ClearingMethodAreaId`),
  KEY `FK_ClearingMethodAreaTerminal_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_ClearingMethodAreaTerminal_SCB_User` (`StatusChangedBy`),
  KEY `FK_ClearingMethodAreaTerminal_CB_User` (`CreatedBy`),
  KEY `FK_ClearingMethodAreaTerminal_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_ClearingMethodAreaTerminal_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ClearingMethodAreaTerminal_CMAI_ClearingMethodArea` FOREIGN KEY (`ClearingMethodAreaId`) REFERENCES `clearingmethodarea` (`Id`),
  CONSTRAINT `FK_ClearingMethodAreaTerminal_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_ClearingMethodAreaTerminal_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ClearingMethodAreaTerminal_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clearingmethodkupathairterminal`
--

DROP TABLE IF EXISTS `clearingmethodkupathairterminal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clearingmethodkupathairterminal` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `ClearingMethodAreaTerminalId` int NOT NULL,
  `TerminalId` int NOT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_CMKHT_CMAT_CMAT` (`ClearingMethodAreaTerminalId`),
  KEY `FK_ClearingMethodKupatHairTerminal_TI_Terminal` (`TerminalId`),
  KEY `FK_ClearingMethodKupatHairTerminal_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_ClearingMethodKupatHairTerminal_SCB_User` (`StatusChangedBy`),
  KEY `FK_ClearingMethodKupatHairTerminal_CB_User` (`CreatedBy`),
  KEY `FK_ClearingMethodKupatHairTerminal_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_ClearingMethodKupatHairTerminal_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ClearingMethodKupatHairTerminal_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_ClearingMethodKupatHairTerminal_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ClearingMethodKupatHairTerminal_TI_Terminal` FOREIGN KEY (`TerminalId`) REFERENCES `terminal` (`Id`),
  CONSTRAINT `FK_ClearingMethodKupatHairTerminal_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_CMKHT_CMAT_CMAT` FOREIGN KEY (`ClearingMethodAreaTerminalId`) REFERENCES `clearingmethodareaterminal` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clothescollectionpoint`
--

DROP TABLE IF EXISTS `clothescollectionpoint`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clothescollectionpoint` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Language` int NOT NULL,
  `Name` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `PointType` int NOT NULL,
  `AddressId` int NOT NULL,
  `ActivityTimeType` int NOT NULL,
  `ActivityDate` date DEFAULT NULL,
  `DateDescription` varchar(1000) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `TimeDescription` varchar(1000) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_ClothesCollectionPoint_L_LutLanguage` (`Language`),
  KEY `FK_ClothesCollectionPoint_PT_LutClothesCollectPointType` (`PointType`),
  KEY `FK_ClothesCollectionPoint_AI_Address` (`AddressId`),
  KEY `FK_ClothesCollectionPoint_ATT_LutActivityTimeType` (`ActivityTimeType`),
  KEY `FK_ClothesCollectionPoint_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_ClothesCollectionPoint_SCB_User` (`StatusChangedBy`),
  KEY `FK_ClothesCollectionPoint_CB_User` (`CreatedBy`),
  KEY `FK_ClothesCollectionPoint_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_ClothesCollectionPoint_AI_Address` FOREIGN KEY (`AddressId`) REFERENCES `address` (`Id`),
  CONSTRAINT `FK_ClothesCollectionPoint_ATT_LutActivityTimeType` FOREIGN KEY (`ActivityTimeType`) REFERENCES `lutactivitytimetype` (`Id`),
  CONSTRAINT `FK_ClothesCollectionPoint_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ClothesCollectionPoint_L_LutLanguage` FOREIGN KEY (`Language`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_ClothesCollectionPoint_PT_LutClothesCollectPointType` FOREIGN KEY (`PointType`) REFERENCES `lutclothescollectpointtype` (`Id`),
  CONSTRAINT `FK_ClothesCollectionPoint_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_ClothesCollectionPoint_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ClothesCollectionPoint_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clothescollectionrequest`
--

DROP TABLE IF EXISTS `clothescollectionrequest`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clothescollectionrequest` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `CustomerId` int NOT NULL,
  `AddressId` int NOT NULL,
  `AntsRouteId` int DEFAULT NULL,
  `PickupDateTime` date DEFAULT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_ClothesCollectionRequest_CI_CustomerUser` (`CustomerId`),
  KEY `FK_ClothesCollectionRequest_AI_Address` (`AddressId`),
  KEY `FK_ClothesCollectionRequest_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_ClothesCollectionRequest_SCB_User` (`StatusChangedBy`),
  KEY `FK_ClothesCollectionRequest_CB_User` (`CreatedBy`),
  KEY `FK_ClothesCollectionRequest_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_ClothesCollectionRequest_AI_Address` FOREIGN KEY (`AddressId`) REFERENCES `address` (`Id`),
  CONSTRAINT `FK_ClothesCollectionRequest_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ClothesCollectionRequest_CI_CustomerUser` FOREIGN KEY (`CustomerId`) REFERENCES `customeruser` (`Id`),
  CONSTRAINT `FK_ClothesCollectionRequest_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_ClothesCollectionRequest_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ClothesCollectionRequest_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clothescollectionsetting`
--

DROP TABLE IF EXISTS `clothescollectionsetting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clothescollectionsetting` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Language` int NOT NULL,
  `Title` varchar(500) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Description` text COLLATE utf8mb4_general_ci,
  `Content` text COLLATE utf8mb4_general_ci,
  `MainMedia` int NOT NULL,
  `MainMobileMedia` int NOT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_ClothesCollectionSetting_L_LutLanguage` (`Language`),
  KEY `FK_ClothesCollectionSetting_MM_Media` (`MainMedia`),
  KEY `FK_ClothesCollectionSetting_MMM_Media` (`MainMobileMedia`),
  KEY `FK_ClothesCollectionSetting_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_ClothesCollectionSetting_SCB_User` (`StatusChangedBy`),
  KEY `FK_ClothesCollectionSetting_CB_User` (`CreatedBy`),
  KEY `FK_ClothesCollectionSetting_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_ClothesCollectionSetting_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ClothesCollectionSetting_L_LutLanguage` FOREIGN KEY (`Language`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_ClothesCollectionSetting_MM_Media` FOREIGN KEY (`MainMedia`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_ClothesCollectionSetting_MMM_Media` FOREIGN KEY (`MainMobileMedia`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_ClothesCollectionSetting_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_ClothesCollectionSetting_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ClothesCollectionSetting_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `currencyrate`
--

DROP TABLE IF EXISTS `currencyrate`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `currencyrate` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Currency` int NOT NULL,
  `RateInILS` float NOT NULL,
  `RateDate` datetime NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UX_Currency_RateDate` (`Currency`,`RateDate`),
  CONSTRAINT `FK_CurrencyRate_C_LutCurrency` FOREIGN KEY (`Currency`) REFERENCES `lutcurrency` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customeraddress`
--

DROP TABLE IF EXISTS `customeraddress`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customeraddress` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `CustomerUserId` int NOT NULL,
  `AddressId` int DEFAULT NULL,
  `IsMainAddress` bit(1) NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_CustomerAddress_CUI_CustomerUser` (`CustomerUserId`),
  KEY `FK_CustomerAddress_AI_Address` (`AddressId`),
  KEY `FK_CustomerAddress_CB_User` (`CreatedBy`),
  KEY `FK_CustomerAddress_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_CustomerAddress_AI_Address` FOREIGN KEY (`AddressId`) REFERENCES `address` (`Id`),
  CONSTRAINT `FK_CustomerAddress_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_CustomerAddress_CUI_CustomerUser` FOREIGN KEY (`CustomerUserId`) REFERENCES `customeruser` (`Id`),
  CONSTRAINT `FK_CustomerAddress_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customeruser`
--

DROP TABLE IF EXISTS `customeruser`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customeruser` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `FirstName` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `LastName` varchar(300) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Gender` int DEFAULT NULL,
  `Email` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `UserName` varchar(40) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Password` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Phone` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UserName` (`UserName`),
  KEY `FK_CustomerUser_G_LutGender` (`Gender`),
  KEY `FK_CustomerUser_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_CustomerUser_SCB_User` (`StatusChangedBy`),
  KEY `FK_CustomerUser_CB_User` (`CreatedBy`),
  KEY `FK_CustomerUser_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_CustomerUser_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_CustomerUser_G_LutGender` FOREIGN KEY (`Gender`) REFERENCES `lutgender` (`Id`),
  CONSTRAINT `FK_CustomerUser_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_CustomerUser_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_CustomerUser_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customerusercrdt`
--

DROP TABLE IF EXISTS `customerusercrdt`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customerusercrdt` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `CustomerUserId` int NOT NULL,
  `LastDigits` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `CreditCardType` int DEFAULT NULL,
  `Token` varchar(1000) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_CustomerUserCrdt_CUI_CustomerUser` (`CustomerUserId`),
  KEY `FK_CustomerUserCrdt_CCT_LutCreditCardType` (`CreditCardType`),
  KEY `FK_CustomerUserCrdt_CB_User` (`CreatedBy`),
  KEY `FK_CustomerUserCrdt_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_CustomerUserCrdt_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_CustomerUserCrdt_CCT_LutCreditCardType` FOREIGN KEY (`CreditCardType`) REFERENCES `lutcreditcardtype` (`Id`),
  CONSTRAINT `FK_CustomerUserCrdt_CUI_CustomerUser` FOREIGN KEY (`CustomerUserId`) REFERENCES `customeruser` (`Id`),
  CONSTRAINT `FK_CustomerUserCrdt_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customeruserprayname`
--

DROP TABLE IF EXISTS `customeruserprayname`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customeruserprayname` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `CustomerUserId` int NOT NULL,
  `Name` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Gender` int DEFAULT NULL,
  `ParentName` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  `PrayDescription` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_CustomerUserPrayName_G_LutGender` (`Gender`),
  KEY `FK_CustomerUserPrayName_CB_User` (`CreatedBy`),
  KEY `FK_CustomerUserPrayName_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_CustomerUserPrayName_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_CustomerUserPrayName_G_LutGender` FOREIGN KEY (`Gender`) REFERENCES `lutgender` (`Id`),
  CONSTRAINT `FK_CustomerUserPrayName_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `donation`
--

DROP TABLE IF EXISTS `donation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `donation` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `ItemId` int NOT NULL,
  `Status` int NOT NULL,
  `Currency` int NOT NULL,
  `LanguageId` int DEFAULT NULL,
  `MonthlySum` float NOT NULL,
  `PaymentsCount` int DEFAULT NULL,
  `PaymentType` int NOT NULL,
  `ReferenceNum` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `ClearingMethodAreaId` int DEFAULT NULL,
  `ClearingMethodTerminalNum` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `TerminalId` int DEFAULT NULL,
  `ProviderReferenceNum` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `ProviderApprovalNum` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `ProviderResultCode` varchar(10) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `ProviderResultMsg` varchar(2000) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `MoreProviderDetails` text COLLATE utf8mb4_general_ci,
  `ReceiptBy` int DEFAULT NULL,
  `ReceiptForCountry` int DEFAULT NULL,
  `ReceiptNum` bigint DEFAULT NULL,
  `UserId` int DEFAULT NULL,
  `DonorFirstName` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `DonorLastName` varchar(300) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `DonorEmail` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `DonorPhone` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `SourceType` int NOT NULL,
  `SourceId` int DEFAULT NULL,
  `UnknownSourceCode` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `RecruiterId` int DEFAULT NULL,
  `SourceApp` int NOT NULL,
  `SourceIP` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `EngravingName` varchar(300) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `SendReceiptByPost` bit(1) NOT NULL,
  `ReceiptAddress` int DEFAULT NULL,
  `ShippingAddress` int DEFAULT NULL,
  `DeliveryMethod` int DEFAULT NULL,
  `DisplayAsAnonymous` bit(1) NOT NULL,
  `DisplayName` varchar(30) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `CustomerComments` text COLLATE utf8mb4_general_ci,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  `DisplayCurrency` int NOT NULL,
  `DisplayMonthlySum` float NOT NULL,
  `StatusReason` varchar(300) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_Donation_II_ProjectItem` (`ItemId`),
  KEY `FK_Donation_S_LutDonationStatus` (`Status`),
  KEY `FK_Donation_C_LutCurrency` (`Currency`),
  KEY `FK_Donation_LI_LutLanguage` (`LanguageId`),
  KEY `FK_Donation_PT_LutPaymentType` (`PaymentType`),
  KEY `FK_Donation_CMAI_ClearingMethodArea` (`ClearingMethodAreaId`),
  KEY `FK_Donation_TI_Terminal` (`TerminalId`),
  KEY `FK_Donation_RB_LutReceiptProvider` (`ReceiptBy`),
  KEY `FK_Donation_RFC_LutClearingArea` (`ReceiptForCountry`),
  KEY `FK_Donation_UI_CustomerUser` (`UserId`),
  KEY `FK_Donation_ST_LutDonationSourceType` (`SourceType`),
  KEY `FK_Donation_SI_Source` (`SourceId`),
  KEY `FK_Donation_RI_Recruiter` (`RecruiterId`),
  KEY `FK_Donation_SA_LutApp` (`SourceApp`),
  KEY `FK_Donation_RA_Address` (`ReceiptAddress`),
  KEY `FK_Donation_SA_Address` (`ShippingAddress`),
  KEY `FK_Donation_DM_LutDeliveryMethod` (`DeliveryMethod`),
  KEY `FK_Donation_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_Donation_SCB_User` (`StatusChangedBy`),
  KEY `FK_Donation_CB_User` (`CreatedBy`),
  KEY `FK_Donation_UB_User` (`UpdatedBy`),
  KEY `FK_Donation_DisplayCurrency` (`DisplayCurrency`),
  CONSTRAINT `FK_Donation_C_LutCurrency` FOREIGN KEY (`Currency`) REFERENCES `lutcurrency` (`Id`),
  CONSTRAINT `FK_Donation_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Donation_CMAI_ClearingMethodArea` FOREIGN KEY (`ClearingMethodAreaId`) REFERENCES `clearingmethodarea` (`Id`),
  CONSTRAINT `FK_Donation_DisplayCurrency` FOREIGN KEY (`DisplayCurrency`) REFERENCES `lutcurrency` (`Id`),
  CONSTRAINT `FK_Donation_DM_LutDeliveryMethod` FOREIGN KEY (`DeliveryMethod`) REFERENCES `lutdeliverymethod` (`Id`),
  CONSTRAINT `FK_Donation_II_ProjectItem` FOREIGN KEY (`ItemId`) REFERENCES `projectitem` (`Id`),
  CONSTRAINT `FK_Donation_LI_LutLanguage` FOREIGN KEY (`LanguageId`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_Donation_PT_LutPaymentType` FOREIGN KEY (`PaymentType`) REFERENCES `lutpaymenttype` (`Id`),
  CONSTRAINT `FK_Donation_RA_Address` FOREIGN KEY (`ReceiptAddress`) REFERENCES `address` (`Id`),
  CONSTRAINT `FK_Donation_RB_LutReceiptProvider` FOREIGN KEY (`ReceiptBy`) REFERENCES `lutreceiptprovider` (`Id`),
  CONSTRAINT `FK_Donation_RFC_LutClearingArea` FOREIGN KEY (`ReceiptForCountry`) REFERENCES `lutclearingarea` (`Id`),
  CONSTRAINT `FK_Donation_RI_Recruiter` FOREIGN KEY (`RecruiterId`) REFERENCES `recruiter` (`Id`),
  CONSTRAINT `FK_Donation_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_Donation_S_LutDonationStatus` FOREIGN KEY (`Status`) REFERENCES `lutdonationstatus` (`Id`),
  CONSTRAINT `FK_Donation_SA_Address` FOREIGN KEY (`ShippingAddress`) REFERENCES `address` (`Id`),
  CONSTRAINT `FK_Donation_SA_LutApp` FOREIGN KEY (`SourceApp`) REFERENCES `lutapp` (`Id`),
  CONSTRAINT `FK_Donation_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Donation_SI_Source` FOREIGN KEY (`SourceId`) REFERENCES `source` (`Id`),
  CONSTRAINT `FK_Donation_ST_LutDonationSourceType` FOREIGN KEY (`SourceType`) REFERENCES `lutdonationsourcetype` (`Id`),
  CONSTRAINT `FK_Donation_TI_Terminal` FOREIGN KEY (`TerminalId`) REFERENCES `terminal` (`Id`),
  CONSTRAINT `FK_Donation_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Donation_UI_CustomerUser` FOREIGN KEY (`UserId`) REFERENCES `customeruser` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `donationactionlog`
--

DROP TABLE IF EXISTS `donationactionlog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `donationactionlog` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `DonationId` int NOT NULL,
  `ActionId` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  `MoreDetails` longtext COLLATE utf8mb4_general_ci,
  `SourceIP` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_DonationActionLog_DI_Donation` (`DonationId`),
  KEY `FK_DonationActionLog_AI_LutDonationAction` (`ActionId`),
  KEY `FK_DonationActionLog_CB_User` (`CreatedBy`),
  KEY `FK_DonationActionLog_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_DonationActionLog_AI_LutDonationAction` FOREIGN KEY (`ActionId`) REFERENCES `lutdonationaction` (`Id`),
  CONSTRAINT `FK_DonationActionLog_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_DonationActionLog_DI_Donation` FOREIGN KEY (`DonationId`) REFERENCES `donation` (`Id`),
  CONSTRAINT `FK_DonationActionLog_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `donationcurrencyvalue`
--

DROP TABLE IF EXISTS `donationcurrencyvalue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `donationcurrencyvalue` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `DonationId` int NOT NULL,
  `Currency` int NOT NULL,
  `RateInILS` float NOT NULL,
  `TotalSum` float DEFAULT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_DonationCurrencyValue_DI_Donation` (`DonationId`),
  KEY `FK_DonationCurrencyValue_C_LutCurrency` (`Currency`),
  KEY `FK_DonationCurrencyValue_CB_User` (`CreatedBy`),
  KEY `FK_DonationCurrencyValue_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_DonationCurrencyValue_C_LutCurrency` FOREIGN KEY (`Currency`) REFERENCES `lutcurrency` (`Id`),
  CONSTRAINT `FK_DonationCurrencyValue_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_DonationCurrencyValue_DI_Donation` FOREIGN KEY (`DonationId`) REFERENCES `donation` (`Id`),
  CONSTRAINT `FK_DonationCurrencyValue_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=101 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entitycontent`
--

DROP TABLE IF EXISTS `entitycontent`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `entitycontent` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `Name` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `IsTemplate` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_EntityContent_CB_User` (`CreatedBy`),
  CONSTRAINT `FK_EntityContent_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entitycontentitem`
--

DROP TABLE IF EXISTS `entitycontentitem`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `entitycontentitem` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `ContentId` int DEFAULT NULL,
  `ItemType` int NOT NULL,
  `ItemDefinition` text COLLATE utf8mb4_general_ci,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  `Name` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_EntityContentItem_CI_EntityContent` (`ContentId`),
  KEY `FK_EntityContentItem_IT_LutContentItemType` (`ItemType`),
  KEY `FK_EntityContentItem_CB_User` (`CreatedBy`),
  KEY `FK_EntityContentItem_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_EntityContentItem_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_EntityContentItem_CI_EntityContent` FOREIGN KEY (`ContentId`) REFERENCES `entitycontent` (`Id`),
  CONSTRAINT `FK_EntityContentItem_IT_LutContentItemType` FOREIGN KEY (`ItemType`) REFERENCES `lutcontentitemtype` (`Id`),
  CONSTRAINT `FK_EntityContentItem_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entitylistvieworderconfig`
--

DROP TABLE IF EXISTS `entitylistvieworderconfig`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `entitylistvieworderconfig` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `EntityType` int NOT NULL,
  `AppLocationType` int NOT NULL,
  `MaxOrderNum` int NOT NULL,
  `AllowNumbersOnly` tinyint(1) NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UK_EntityType_AppLocationType` (`EntityType`,`AppLocationType`),
  KEY `FKEntityListViewOrderConfig_AppLocationType` (`AppLocationType`),
  KEY `FKEntityListViewOrderConfig_CreatedBy` (`CreatedBy`),
  KEY `FKEntityListViewOrderConfig_UpdatedBy` (`UpdatedBy`),
  CONSTRAINT `FKEntityListViewOrderConfig_AppLocationType` FOREIGN KEY (`AppLocationType`) REFERENCES `lutapplocationtype` (`Id`),
  CONSTRAINT `FKEntityListViewOrderConfig_CreatedBy` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FKEntityListViewOrderConfig_EntityType` FOREIGN KEY (`EntityType`) REFERENCES `lutentitytype` (`Id`),
  CONSTRAINT `FKEntityListViewOrderConfig_UpdatedBy` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entitymedia`
--

DROP TABLE IF EXISTS `entitymedia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `entitymedia` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `EntityType` int NOT NULL,
  `EntityId` int NOT NULL,
  `Language` int NOT NULL,
  `MediaId` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_EntityMedia_ET_LutEntityType` (`EntityType`),
  KEY `FK_EntityMedia_L_LutLanguage` (`Language`),
  KEY `FK_EntityMedia_MI_Media` (`MediaId`),
  KEY `FK_EntityMedia_CB_User` (`CreatedBy`),
  KEY `FK_EntityMedia_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_EntityMedia_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_EntityMedia_ET_LutEntityType` FOREIGN KEY (`EntityType`) REFERENCES `lutentitytype` (`Id`),
  CONSTRAINT `FK_EntityMedia_L_LutLanguage` FOREIGN KEY (`Language`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_EntityMedia_MI_Media` FOREIGN KEY (`MediaId`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_EntityMedia_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entitymoredisplaylocation`
--

DROP TABLE IF EXISTS `entitymoredisplaylocation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `entitymoredisplaylocation` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `SourceEntityType` int NOT NULL,
  `EntityId` int NOT NULL,
  `Language` int DEFAULT NULL,
  `TargetEntityType` int NOT NULL,
  `AppLocationType` int NOT NULL,
  `Order` int DEFAULT NULL,
  `LinkSettings` int DEFAULT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FKEntityMoreDisplayLocation_SourceEntityType` (`SourceEntityType`),
  KEY `FKEntityMoreDisplayLocation_Language` (`Language`),
  KEY `FKEntityMoreDisplayLocation_TargetEntityType` (`TargetEntityType`),
  KEY `FKEntityMoreDisplayLocation_AppLocationType` (`AppLocationType`),
  KEY `FKEntityMoreDisplayLocation_Order` (`Order`),
  KEY `FKEntityMoreDisplayLocation_LinkSettings` (`LinkSettings`),
  KEY `FKEntityMoreDisplayLocation_RecordStatus` (`RecordStatus`),
  KEY `FKEntityMoreDisplayLocation_StatusChangedBy` (`StatusChangedBy`),
  KEY `FKEntityMoreDisplayLocation_CreatedBy` (`CreatedBy`),
  KEY `FKEntityMoreDisplayLocation_UpdatedBy` (`UpdatedBy`),
  CONSTRAINT `FKEntityMoreDisplayLocation_AppLocationType` FOREIGN KEY (`AppLocationType`) REFERENCES `lutapplocationtype` (`Id`),
  CONSTRAINT `FKEntityMoreDisplayLocation_CreatedBy` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FKEntityMoreDisplayLocation_Language` FOREIGN KEY (`Language`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FKEntityMoreDisplayLocation_LinkSettings` FOREIGN KEY (`LinkSettings`) REFERENCES `linksetting` (`Id`),
  CONSTRAINT `FKEntityMoreDisplayLocation_Order` FOREIGN KEY (`Order`) REFERENCES `lutlistvieworder` (`Id`),
  CONSTRAINT `FKEntityMoreDisplayLocation_RecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FKEntityMoreDisplayLocation_SourceEntityType` FOREIGN KEY (`SourceEntityType`) REFERENCES `lutentitytype` (`Id`),
  CONSTRAINT `FKEntityMoreDisplayLocation_StatusChangedBy` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FKEntityMoreDisplayLocation_TargetEntityType` FOREIGN KEY (`TargetEntityType`) REFERENCES `lutentitytype` (`Id`),
  CONSTRAINT `FKEntityMoreDisplayLocation_UpdatedBy` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entitytag`
--

DROP TABLE IF EXISTS `entitytag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `entitytag` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `EntityType` int NOT NULL,
  `EntityId` int NOT NULL,
  `TagId` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_EntityTag_ET_LutEntityType` (`EntityType`),
  KEY `FK_EntityTag_TI_LutTag` (`TagId`),
  KEY `FK_EntityTag_CB_User` (`CreatedBy`),
  CONSTRAINT `FK_EntityTag_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_EntityTag_ET_LutEntityType` FOREIGN KEY (`EntityType`) REFERENCES `lutentitytype` (`Id`),
  CONSTRAINT `FK_EntityTag_TI_LutTag` FOREIGN KEY (`TagId`) REFERENCES `luttag` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `fundcategory`
--

DROP TABLE IF EXISTS `fundcategory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fundcategory` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `FundId` int NOT NULL,
  `CategoryId` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UK_FundId_CategoryId` (`FundId`,`CategoryId`),
  KEY `FK_FundCategory_CI_LutFundCategory` (`CategoryId`),
  KEY `FK_FundCategory_CB_User` (`CreatedBy`),
  CONSTRAINT `FK_FundCategory_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_FundCategory_CI_LutFundCategory` FOREIGN KEY (`CategoryId`) REFERENCES `lutfundcategory` (`Id`),
  CONSTRAINT `FK_FundCategory_FI_Project` FOREIGN KEY (`FundId`) REFERENCES `project` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `gallery`
--

DROP TABLE IF EXISTS `gallery`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gallery` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Name` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Order` int DEFAULT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_Gallery_CB_User` (`CreatedBy`),
  KEY `FK_Gallery_UB_User` (`UpdatedBy`),
  KEY `FK_Gallery_RecordStatus` (`RecordStatus`),
  KEY `FK_Gallery_StatusChangedBy` (`StatusChangedBy`),
  CONSTRAINT `FK_Gallery_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Gallery_RecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_Gallery_StatusChangedBy` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Gallery_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `gallerylocalization`
--

DROP TABLE IF EXISTS `gallerylocalization`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gallerylocalization` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `GalleryId` int NOT NULL,
  `Language` int NOT NULL,
  `Title` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `Display` bit(1) NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_GalleryLocalization_GI_Gallery` (`GalleryId`),
  KEY `FK_GalleryLocalization_L_LutLanguage` (`Language`),
  KEY `FK_GalleryLocalization_CB_User` (`CreatedBy`),
  KEY `FK_GalleryLocalization_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_GalleryLocalization_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_GalleryLocalization_GI_Gallery` FOREIGN KEY (`GalleryId`) REFERENCES `gallery` (`Id`),
  CONSTRAINT `FK_GalleryLocalization_L_LutLanguage` FOREIGN KEY (`Language`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_GalleryLocalization_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `gallerymedia`
--

DROP TABLE IF EXISTS `gallerymedia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gallerymedia` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `GalleryId` int NOT NULL,
  `MediaId` int NOT NULL,
  `isMainMedia` bit(1) DEFAULT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_GalleryMedia_GI_Gallery` (`GalleryId`),
  KEY `FK_GalleryMedia_MI_Media` (`MediaId`),
  KEY `FK_GalleryMedia_CB_User` (`CreatedBy`),
  CONSTRAINT `FK_GalleryMedia_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_GalleryMedia_GI_Gallery` FOREIGN KEY (`GalleryId`) REFERENCES `gallery` (`Id`),
  CONSTRAINT `FK_GalleryMedia_MI_Media` FOREIGN KEY (`MediaId`) REFERENCES `media` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `globalconfig`
--

DROP TABLE IF EXISTS `globalconfig`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `globalconfig` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `ConfigParam` int NOT NULL,
  `Language` int DEFAULT NULL,
  `Value` varchar(1000) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UK_ConfigParam_Lan` (`ConfigParam`,`Language`),
  KEY `FK_GlobalConfig_L_LutLanguage` (`Language`),
  KEY `FK_GlobalConfig_CB_User` (`CreatedBy`),
  KEY `FK_GlobalConfig_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_GlobalConfig_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_GlobalConfig_CP_LutGlobalConfigParam` FOREIGN KEY (`ConfigParam`) REFERENCES `lutglobalconfigparam` (`Id`),
  CONSTRAINT `FK_GlobalConfig_L_LutLanguage` FOREIGN KEY (`Language`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_GlobalConfig_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lead`
--

DROP TABLE IF EXISTS `lead`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lead` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `ProjectId` int NOT NULL,
  `Status` int NOT NULL,
  `CustomerUserId` int DEFAULT NULL,
  `FirstName` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `LastName` varchar(300) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `Email` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `Phone` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `SourceType` int NOT NULL,
  `SourceId` int NOT NULL,
  `UnknownSourceCode` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `SourceIP` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `Address` int DEFAULT NULL,
  `CustomerComments` longtext COLLATE utf8mb4_general_ci,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_Lead_PI_Project` (`ProjectId`),
  KEY `FK_Lead_S_LutLeadStatus` (`Status`),
  KEY `FK_Lead_CUI_CustomerUser` (`CustomerUserId`),
  KEY `FK_Lead_ST_LutDonationSourceType` (`SourceType`),
  KEY `FK_Lead_SI_Source` (`SourceId`),
  KEY `FK_Lead_A_Address` (`Address`),
  KEY `FK_Lead_CB_User` (`CreatedBy`),
  KEY `FK_Lead_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_Lead_A_Address` FOREIGN KEY (`Address`) REFERENCES `address` (`Id`),
  CONSTRAINT `FK_Lead_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Lead_CUI_CustomerUser` FOREIGN KEY (`CustomerUserId`) REFERENCES `customeruser` (`Id`),
  CONSTRAINT `FK_Lead_PI_Project` FOREIGN KEY (`ProjectId`) REFERENCES `project` (`Id`),
  CONSTRAINT `FK_Lead_S_LutLeadStatus` FOREIGN KEY (`Status`) REFERENCES `lutleadstatus` (`Id`),
  CONSTRAINT `FK_Lead_SI_Source` FOREIGN KEY (`SourceId`) REFERENCES `source` (`Id`),
  CONSTRAINT `FK_Lead_ST_LutDonationSourceType` FOREIGN KEY (`SourceType`) REFERENCES `lutdonationsourcetype` (`Id`),
  CONSTRAINT `FK_Lead_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `linksetting`
--

DROP TABLE IF EXISTS `linksetting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `linksetting` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `LinkType` int NOT NULL,
  `LinkTargetType` int NOT NULL,
  `ProjectId` int NOT NULL,
  `ItemId` int DEFAULT NULL,
  `LinkText` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `MediaId` int DEFAULT NULL,
  `MobileMediaId` int DEFAULT NULL,
  `Description` varchar(1000) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `DonationPagePaymentType` int DEFAULT NULL,
  `DonationPagePaymentSum` int DEFAULT NULL,
  `DonationPagePaymentCount` int DEFAULT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_LinkSetting_LT_LutLinkType` (`LinkType`),
  KEY `FK_LinkSetting_LTT_LutLinkTargetType` (`LinkTargetType`),
  KEY `FK_LinkSetting_PI_Project` (`ProjectId`),
  KEY `FK_LinkSetting_II_ProjectItem` (`ItemId`),
  KEY `FK_LinkSetting_MI_Media` (`MediaId`),
  KEY `FK_LinkSetting_MMI_Media` (`MobileMediaId`),
  KEY `FK_LinkSetting_DPPT_LutPaymentType` (`DonationPagePaymentType`),
  KEY `FK_LinkSetting_CB_User` (`CreatedBy`),
  KEY `FK_LinkSetting_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_LinkSetting_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_LinkSetting_DPPT_LutPaymentType` FOREIGN KEY (`DonationPagePaymentType`) REFERENCES `lutpaymenttype` (`Id`),
  CONSTRAINT `FK_LinkSetting_II_ProjectItem` FOREIGN KEY (`ItemId`) REFERENCES `projectitem` (`Id`),
  CONSTRAINT `FK_LinkSetting_LT_LutLinkType` FOREIGN KEY (`LinkType`) REFERENCES `lutlinktype` (`Id`),
  CONSTRAINT `FK_LinkSetting_LTT_LutLinkTargetType` FOREIGN KEY (`LinkTargetType`) REFERENCES `lutlinktargettype` (`Id`),
  CONSTRAINT `FK_LinkSetting_MI_Media` FOREIGN KEY (`MediaId`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_LinkSetting_MMI_Media` FOREIGN KEY (`MobileMediaId`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_LinkSetting_PI_Project` FOREIGN KEY (`ProjectId`) REFERENCES `project` (`Id`),
  CONSTRAINT `FK_LinkSetting_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=316 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutactivitytimetype`
--

DROP TABLE IF EXISTS `lutactivitytimetype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutactivitytimetype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutapp`
--

DROP TABLE IF EXISTS `lutapp`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutapp` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutapplocationtype`
--

DROP TABLE IF EXISTS `lutapplocationtype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutapplocationtype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `IsSystemValue` tinyint(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutclearingarea`
--

DROP TABLE IF EXISTS `lutclearingarea`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutclearingarea` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  `DefaultCurrency` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_LutClearingArea_DC_LutCurrency` (`DefaultCurrency`),
  CONSTRAINT `FK_LutClearingArea_DC_LutCurrency` FOREIGN KEY (`DefaultCurrency`) REFERENCES `lutcurrency` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutclearingmethodtype`
--

DROP TABLE IF EXISTS `lutclearingmethodtype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutclearingmethodtype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) DEFAULT NULL,
  `OnlineSupport` bit(1) DEFAULT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutclothescollectpointtype`
--

DROP TABLE IF EXISTS `lutclothescollectpointtype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutclothescollectpointtype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutcontentitemtype`
--

DROP TABLE IF EXISTS `lutcontentitemtype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutcontentitemtype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  `JsonStructure` longtext COLLATE utf8mb4_general_ci,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutcountry`
--

DROP TABLE IF EXISTS `lutcountry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutcountry` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `FlagIcon` longblob,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutcreditcardtype`
--

DROP TABLE IF EXISTS `lutcreditcardtype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutcreditcardtype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutcurrency`
--

DROP TABLE IF EXISTS `lutcurrency`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutcurrency` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `CurrencyCode` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `IsSystemValue` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `CurrencyCode` (`CurrencyCode`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutdeliverymethod`
--

DROP TABLE IF EXISTS `lutdeliverymethod`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutdeliverymethod` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutdonationaction`
--

DROP TABLE IF EXISTS `lutdonationaction`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutdonationaction` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutdonationsourcetype`
--

DROP TABLE IF EXISTS `lutdonationsourcetype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutdonationsourcetype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutdonationstatus`
--

DROP TABLE IF EXISTS `lutdonationstatus`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutdonationstatus` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutdonationstatusreason`
--

DROP TABLE IF EXISTS `lutdonationstatusreason`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutdonationstatusreason` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutentitytype`
--

DROP TABLE IF EXISTS `lutentitytype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutentitytype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutfundcategory`
--

DROP TABLE IF EXISTS `lutfundcategory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutfundcategory` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Order` int NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutgender`
--

DROP TABLE IF EXISTS `lutgender`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutgender` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutglobalconfigparam`
--

DROP TABLE IF EXISTS `lutglobalconfigparam`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutglobalconfigparam` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Type` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutlanguage`
--

DROP TABLE IF EXISTS `lutlanguage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutlanguage` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `DefaultCurrency` int NOT NULL,
  `Domain` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `IsSystemValue` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_LutLanguage_DC_LutCurrency` (`DefaultCurrency`),
  CONSTRAINT `FK_LutLanguage_DC_LutCurrency` FOREIGN KEY (`DefaultCurrency`) REFERENCES `lutcurrency` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutleadstatus`
--

DROP TABLE IF EXISTS `lutleadstatus`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutleadstatus` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutlinktargettype`
--

DROP TABLE IF EXISTS `lutlinktargettype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutlinktargettype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutlinktype`
--

DROP TABLE IF EXISTS `lutlinktype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutlinktype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutlisttype`
--

DROP TABLE IF EXISTS `lutlisttype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutlisttype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutlistvieworder`
--

DROP TABLE IF EXISTS `lutlistvieworder`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutlistvieworder` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=104 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutmailtype`
--

DROP TABLE IF EXISTS `lutmailtype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutmailtype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutmainmenuitem`
--

DROP TABLE IF EXISTS `lutmainmenuitem`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutmainmenuitem` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutmediasourcetype`
--

DROP TABLE IF EXISTS `lutmediasourcetype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutmediasourcetype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutmediatype`
--

DROP TABLE IF EXISTS `lutmediatype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutmediatype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutpage`
--

DROP TABLE IF EXISTS `lutpage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutpage` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) DEFAULT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_LutPage_CB_User` (`CreatedBy`),
  KEY `FK_LutPage_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_LutPage_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_LutPage_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutpaymenttype`
--

DROP TABLE IF EXISTS `lutpaymenttype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutpaymenttype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutperiodtype`
--

DROP TABLE IF EXISTS `lutperiodtype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutperiodtype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutpermissionlevel`
--

DROP TABLE IF EXISTS `lutpermissionlevel`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutpermissionlevel` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) DEFAULT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutpermissiontype`
--

DROP TABLE IF EXISTS `lutpermissiontype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutpermissiontype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) DEFAULT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutplatformtype`
--

DROP TABLE IF EXISTS `lutplatformtype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutplatformtype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutpricetype`
--

DROP TABLE IF EXISTS `lutpricetype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutpricetype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutprojectitemtype`
--

DROP TABLE IF EXISTS `lutprojectitemtype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutprojectitemtype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutprojecttype`
--

DROP TABLE IF EXISTS `lutprojecttype`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutprojecttype` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutrecaptchaexclusionreason`
--

DROP TABLE IF EXISTS `lutrecaptchaexclusionreason`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutrecaptchaexclusionreason` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `IsSystemValue` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutreceiptprovider`
--

DROP TABLE IF EXISTS `lutreceiptprovider`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutreceiptprovider` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  `DisplayReceiptLink` bit(1) DEFAULT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lutrecordstatus`
--

DROP TABLE IF EXISTS `lutrecordstatus`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lutrecordstatus` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `IsSystemValue` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `luttag`
--

DROP TABLE IF EXISTS `luttag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `luttag` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) NOT NULL,
  PRIMARY KEY (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mailtemplate`
--

DROP TABLE IF EXISTS `mailtemplate`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mailtemplate` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Language` int NOT NULL,
  `MailType` int NOT NULL,
  `Subject` varchar(500) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Content` longtext COLLATE utf8mb4_general_ci NOT NULL,
  `FromMail` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `BccMail` varchar(500) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `FromName` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UK_Lan_MailType` (`Language`,`MailType`),
  KEY `FK_MailTemplate_MT_LutMailType` (`MailType`),
  KEY `FK_MailTemplate_CB_User` (`CreatedBy`),
  KEY `FK_MailTemplate_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_MailTemplate_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_MailTemplate_L_LutLanguage` FOREIGN KEY (`Language`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_MailTemplate_MT_LutMailType` FOREIGN KEY (`MailType`) REFERENCES `lutmailtype` (`Id`),
  CONSTRAINT `FK_MailTemplate_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mainmenuitemsetting`
--

DROP TABLE IF EXISTS `mainmenuitemsetting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mainmenuitemsetting` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `MenuItemId` int NOT NULL,
  `Language` int NOT NULL,
  `Title` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Display` bit(1) NOT NULL,
  `Order` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_MainMenuItemSetting_MII_LutMainMenuItem` (`MenuItemId`),
  KEY `FK_MainMenuItemSetting_L_LutLanguage` (`Language`),
  KEY `FK_MainMenuItemSetting_CB_User` (`CreatedBy`),
  KEY `FK_MainMenuItemSetting_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_MainMenuItemSetting_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_MainMenuItemSetting_L_LutLanguage` FOREIGN KEY (`Language`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_MainMenuItemSetting_MII_LutMainMenuItem` FOREIGN KEY (`MenuItemId`) REFERENCES `lutmainmenuitem` (`Id`),
  CONSTRAINT `FK_MainMenuItemSetting_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `media`
--

DROP TABLE IF EXISTS `media`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `media` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `YearDirectory` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `MonthDirectory` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `RelativePath` varchar(500) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `SourceType` int NOT NULL,
  `MediaType` int NOT NULL,
  `FriendlyName` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `MatchToPlatform` int NOT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_Media_ST_LutMediaSourceType` (`SourceType`),
  KEY `FK_Media_MT_LutMediaType` (`MediaType`),
  KEY `FK_Media_MTP_LutPlatformType` (`MatchToPlatform`),
  KEY `FK_Media_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_Media_SCB_User` (`StatusChangedBy`),
  KEY `FK_Media_CB_User` (`CreatedBy`),
  KEY `FK_Media_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_Media_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Media_MT_LutMediaType` FOREIGN KEY (`MediaType`) REFERENCES `lutmediatype` (`Id`),
  CONSTRAINT `FK_Media_MTP_LutPlatformType` FOREIGN KEY (`MatchToPlatform`) REFERENCES `lutplatformtype` (`Id`),
  CONSTRAINT `FK_Media_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_Media_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Media_ST_LutMediaSourceType` FOREIGN KEY (`SourceType`) REFERENCES `lutmediasourcetype` (`Id`),
  CONSTRAINT `FK_Media_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=51 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `moreitemlink`
--

DROP TABLE IF EXISTS `moreitemlink`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `moreitemlink` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `EntityType` int DEFAULT NULL,
  `EntityId` int DEFAULT NULL,
  `Language` int DEFAULT NULL,
  `ListType` int NOT NULL,
  `ProjectId` int NOT NULL,
  `ProjectItemId` int DEFAULT NULL,
  `LinkSettingId` int NOT NULL,
  `DonateLinkSettingId` int DEFAULT NULL,
  `DonateParamsSameToLinkSettingsParams` bit(1) NOT NULL,
  `Order` int NOT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_MoreItemLink_ET_LutEntityType` (`EntityType`),
  KEY `FK_MoreItemLink_L_LutLanguage` (`Language`),
  KEY `FK_MoreItemLink_LT_LutListType` (`ListType`),
  KEY `FK_MoreItemLink_PI_Project` (`ProjectId`),
  KEY `FK_MoreItemLink_PII_ProjectItem` (`ProjectItemId`),
  KEY `FK_MoreItemLink_LSI_LinkSetting` (`LinkSettingId`),
  KEY `FK_MoreItemLink_DLSI_LinkSetting` (`DonateLinkSettingId`),
  KEY `FK_MoreItemLink_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_MoreItemLink_SCB_User` (`StatusChangedBy`),
  KEY `FK_MoreItemLink_CB_User` (`CreatedBy`),
  KEY `FK_MoreItemLink_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_MoreItemLink_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_MoreItemLink_DLSI_LinkSetting` FOREIGN KEY (`DonateLinkSettingId`) REFERENCES `linksetting` (`Id`),
  CONSTRAINT `FK_MoreItemLink_ET_LutEntityType` FOREIGN KEY (`EntityType`) REFERENCES `lutentitytype` (`Id`),
  CONSTRAINT `FK_MoreItemLink_L_LutLanguage` FOREIGN KEY (`Language`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_MoreItemLink_LSI_LinkSetting` FOREIGN KEY (`LinkSettingId`) REFERENCES `linksetting` (`Id`),
  CONSTRAINT `FK_MoreItemLink_LT_LutListType` FOREIGN KEY (`ListType`) REFERENCES `lutlisttype` (`Id`),
  CONSTRAINT `FK_MoreItemLink_PI_Project` FOREIGN KEY (`ProjectId`) REFERENCES `project` (`Id`),
  CONSTRAINT `FK_MoreItemLink_PII_ProjectItem` FOREIGN KEY (`ProjectItemId`) REFERENCES `projectitem` (`Id`),
  CONSTRAINT `FK_MoreItemLink_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_MoreItemLink_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_MoreItemLink_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pagedisplaytag`
--

DROP TABLE IF EXISTS `pagedisplaytag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pagedisplaytag` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `PageSettingId` int NOT NULL,
  `TagId` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_PageDisplayTag_PSI_PageSetting` (`PageSettingId`),
  KEY `FK_PageDisplayTag_TI_LutTag` (`TagId`),
  KEY `FK_PageDisplayTag_CB_User` (`CreatedBy`),
  CONSTRAINT `FK_PageDisplayTag_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_PageDisplayTag_PSI_PageSetting` FOREIGN KEY (`PageSettingId`) REFERENCES `pagesetting` (`Id`),
  CONSTRAINT `FK_PageDisplayTag_TI_LutTag` FOREIGN KEY (`TagId`) REFERENCES `luttag` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pagedynamiclinkitem`
--

DROP TABLE IF EXISTS `pagedynamiclinkitem`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pagedynamiclinkitem` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `PageSettingId` int NOT NULL,
  `Order` int DEFAULT NULL,
  `LinkText` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `RelativeLink` varchar(500) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `MediaId` int NOT NULL,
  `Icon` longblob,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_PageDynamicLinkItem_PSI_PageSetting` (`PageSettingId`),
  KEY `FK_PageDynamicLinkItem_MI_Media` (`MediaId`),
  KEY `FK_PageDynamicLinkItem_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_PageDynamicLinkItem_SCB_User` (`StatusChangedBy`),
  KEY `FK_PageDynamicLinkItem_CB_User` (`CreatedBy`),
  KEY `FK_PageDynamicLinkItem_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_PageDynamicLinkItem_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_PageDynamicLinkItem_MI_Media` FOREIGN KEY (`MediaId`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_PageDynamicLinkItem_PSI_PageSetting` FOREIGN KEY (`PageSettingId`) REFERENCES `pagesetting` (`Id`),
  CONSTRAINT `FK_PageDynamicLinkItem_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_PageDynamicLinkItem_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_PageDynamicLinkItem_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pagesetting`
--

DROP TABLE IF EXISTS `pagesetting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pagesetting` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Language` int NOT NULL,
  `PageId` int NOT NULL,
  `IsHomePage` bit(1) NOT NULL,
  `MainMenuItemId` int DEFAULT NULL,
  `MainMedia` int DEFAULT NULL,
  `MainMobileMedia` int DEFAULT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_PageSetting_L_LutLanguage` (`Language`),
  KEY `FK_PageSetting_PI_LutPage` (`PageId`),
  KEY `FK_PageSetting_MMII_LutMainMenuItem` (`MainMenuItemId`),
  KEY `FK_PageSetting_MM_Media` (`MainMedia`),
  KEY `FK_PageSetting_MMM_Media` (`MainMobileMedia`),
  KEY `FK_PageSetting_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_PageSetting_SCB_User` (`StatusChangedBy`),
  KEY `FK_PageSetting_CB_User` (`CreatedBy`),
  KEY `FK_PageSetting_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_PageSetting_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_PageSetting_L_LutLanguage` FOREIGN KEY (`Language`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_PageSetting_MM_Media` FOREIGN KEY (`MainMedia`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_PageSetting_MMII_LutMainMenuItem` FOREIGN KEY (`MainMenuItemId`) REFERENCES `lutmainmenuitem` (`Id`),
  CONSTRAINT `FK_PageSetting_MMM_Media` FOREIGN KEY (`MainMobileMedia`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_PageSetting_PI_LutPage` FOREIGN KEY (`PageId`) REFERENCES `lutpage` (`Id`),
  CONSTRAINT `FK_PageSetting_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_PageSetting_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_PageSetting_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `permission`
--

DROP TABLE IF EXISTS `permission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permission` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `PermissionName` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `PermissionType` int NOT NULL,
  `Description` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `PermissionName` (`PermissionName`),
  KEY `FK_Permission_PT_LutPermissionType` (`PermissionType`),
  CONSTRAINT `FK_Permission_PT_LutPermissionType` FOREIGN KEY (`PermissionType`) REFERENCES `lutpermissiontype` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `prayname`
--

DROP TABLE IF EXISTS `prayname`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prayname` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `BelongToEntityType` int NOT NULL,
  `BelongToEntityId` int NOT NULL,
  `Name` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Gender` int DEFAULT NULL,
  `ParentName` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `PrayDescription` text COLLATE utf8mb4_general_ci NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_PrayName_BTET_LutEntityType` (`BelongToEntityType`),
  KEY `FK_PrayName_G_LutGender` (`Gender`),
  KEY `FK_PrayName_CB_User` (`CreatedBy`),
  KEY `FK_PrayName_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_PrayName_BTET_LutEntityType` FOREIGN KEY (`BelongToEntityType`) REFERENCES `lutentitytype` (`Id`),
  CONSTRAINT `FK_PrayName_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_PrayName_G_LutGender` FOREIGN KEY (`Gender`) REFERENCES `lutgender` (`Id`),
  CONSTRAINT `FK_PrayName_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `project`
--

DROP TABLE IF EXISTS `project`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `project` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Name` varchar(150) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `ProjectType` int NOT NULL,
  `KupatFundNo` int DEFAULT NULL,
  `TerminalId` int NOT NULL DEFAULT '1',
  `DisplayAsSelfView` bit(1) DEFAULT NULL,
  `MainMedia` int DEFAULT NULL,
  `ImageForListsView` int DEFAULT NULL,
  `DisplayItemsInProjectPage` bit(1) DEFAULT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_Project_PT_LutProjectType` (`ProjectType`),
  KEY `FK_Project_TI_Terminal` (`TerminalId`),
  KEY `FK_Project_MM_Media` (`MainMedia`),
  KEY `FK_Project_IFLV_Media` (`ImageForListsView`),
  KEY `FK_Project_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_Project_SCB_User` (`StatusChangedBy`),
  KEY `FK_Project_CB_User` (`CreatedBy`),
  KEY `FK_Project_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_Project_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Project_IFLV_Media` FOREIGN KEY (`ImageForListsView`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_Project_MM_Media` FOREIGN KEY (`MainMedia`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_Project_PT_LutProjectType` FOREIGN KEY (`ProjectType`) REFERENCES `lutprojecttype` (`Id`),
  CONSTRAINT `FK_Project_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_Project_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Project_TI_Terminal` FOREIGN KEY (`TerminalId`) REFERENCES `terminal` (`Id`),
  CONSTRAINT `FK_Project_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `projectitem`
--

DROP TABLE IF EXISTS `projectitem`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projectitem` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `ProjectId` int NOT NULL,
  `ItemName` varchar(150) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `ItemType` int NOT NULL,
  `PriceType` int NOT NULL,
  `KupatFundNo` int DEFAULT NULL,
  `HasEngravingName` bit(1) NOT NULL,
  `AllowFreeAddPrayerNames` bit(1) NOT NULL,
  `AllowAddDedication` bit(1) DEFAULT NULL,
  `DeliveryMethod` int DEFAULT NULL,
  `AllowSelfPickup` bit(1) DEFAULT NULL,
  `MainMedia` int DEFAULT NULL,
  `ImageForListsView` int DEFAULT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  `MediaForExecutePage` int DEFAULT NULL,
  `MobileMediaForExecutePage` int DEFAULT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_ProjectItem_PI_Project` (`ProjectId`),
  KEY `FK_ProjectItem_IT_LutProjectItemType` (`ItemType`),
  KEY `FK_ProjectItem_PT_LutPriceType` (`PriceType`),
  KEY `FK_ProjectItem_DM_LutDeliveryMethod` (`DeliveryMethod`),
  KEY `FK_ProjectItem_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_ProjectItem_SCB_User` (`StatusChangedBy`),
  KEY `FK_ProjectItem_CB_User` (`CreatedBy`),
  KEY `FK_ProjectItem_UB_User` (`UpdatedBy`),
  KEY `FK_ProjectItem_MediaForExecutePage` (`MediaForExecutePage`),
  KEY `FK_ProjectItem_MobileMediaForExecutePage` (`MobileMediaForExecutePage`),
  CONSTRAINT `FK_ProjectItem_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ProjectItem_DM_LutDeliveryMethod` FOREIGN KEY (`DeliveryMethod`) REFERENCES `lutdeliverymethod` (`Id`),
  CONSTRAINT `FK_ProjectItem_IT_LutProjectItemType` FOREIGN KEY (`ItemType`) REFERENCES `lutprojectitemtype` (`Id`),
  CONSTRAINT `FK_ProjectItem_MediaForExecutePage` FOREIGN KEY (`MediaForExecutePage`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_ProjectItem_MobileMediaForExecutePage` FOREIGN KEY (`MobileMediaForExecutePage`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_ProjectItem_PI_Project` FOREIGN KEY (`ProjectId`) REFERENCES `project` (`Id`),
  CONSTRAINT `FK_ProjectItem_PT_LutPriceType` FOREIGN KEY (`PriceType`) REFERENCES `lutpricetype` (`Id`),
  CONSTRAINT `FK_ProjectItem_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_ProjectItem_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ProjectItem_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=39 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `projectitemlocalization`
--

DROP TABLE IF EXISTS `projectitemlocalization`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projectitemlocalization` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `ItemId` int NOT NULL,
  `Language` int NOT NULL,
  `DisplayInSite` bit(1) NOT NULL,
  `Title` varchar(150) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `TitleForExecutePage` varchar(150) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `Description` varchar(2000) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `MainMedia` int DEFAULT NULL,
  `ImageForListsView` int DEFAULT NULL,
  `MediaForExecutePage` int DEFAULT NULL,
  `MobileMediaForExecutePage` int DEFAULT NULL,
  `ContentId` int DEFAULT NULL,
  `PaymentSum` int DEFAULT NULL,
  `DefaultPaymentType` int DEFAULT NULL,
  `DefaultPaymentsCount` int DEFAULT NULL,
  `MaxPaymentsCount` int DEFAULT '24',
  `MinPaymentSum` int DEFAULT NULL,
  `LowPriceWarningMessage` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `NameForReceipt` varchar(150) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `DynamicFieldLabel` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `OrderInListView` int DEFAULT NULL,
  `OrderInItemsPageView` int DEFAULT NULL,
  `ItemsViewLinkSettingId` int DEFAULT NULL,
  `MainButtonLinkSettingId` int DEFAULT NULL,
  `OrderInProjectPageFooter` int DEFAULT NULL,
  `ProjectFooterLinkSettingId` int DEFAULT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UK_ProjectItem_Lan` (`ItemId`,`Language`),
  KEY `FK_ProjectItemLocalization_L_LutLanguage` (`Language`),
  KEY `FK_ProjectItemLocalization_MM_Media` (`MainMedia`),
  KEY `FK_ProjectItemLocalization_IFLV_Media` (`ImageForListsView`),
  KEY `FK_ProjectItemLocalization_MFEP_Media` (`MediaForExecutePage`),
  KEY `FK_ProjectItemLocalization_MMFEP_Media` (`MobileMediaForExecutePage`),
  KEY `FK_ProjectItemLocalization_CI_EntityContent` (`ContentId`),
  KEY `FK_ProjectItemLocalization_DPT_LutPaymentType` (`DefaultPaymentType`),
  KEY `FK_ProjectItemLocalization_IVLSI_LinkSetting` (`ItemsViewLinkSettingId`),
  KEY `FK_ProjectItemLocalization_MBLSI_LinkSetting` (`MainButtonLinkSettingId`),
  KEY `FK_ProjectItemLocalization_PFLSI_LinkSetting` (`ProjectFooterLinkSettingId`),
  KEY `FK_ProjectItemLocalization_CB_User` (`CreatedBy`),
  KEY `FK_ProjectItemLocalization_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_ProjectItemLocalization_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ProjectItemLocalization_CI_EntityContent` FOREIGN KEY (`ContentId`) REFERENCES `entitycontent` (`Id`),
  CONSTRAINT `FK_ProjectItemLocalization_DPT_LutPaymentType` FOREIGN KEY (`DefaultPaymentType`) REFERENCES `lutpaymenttype` (`Id`),
  CONSTRAINT `FK_ProjectItemLocalization_IFLV_Media` FOREIGN KEY (`ImageForListsView`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_ProjectItemLocalization_II_ProjectItem` FOREIGN KEY (`ItemId`) REFERENCES `projectitem` (`Id`),
  CONSTRAINT `FK_ProjectItemLocalization_IVLSI_LinkSetting` FOREIGN KEY (`ItemsViewLinkSettingId`) REFERENCES `linksetting` (`Id`),
  CONSTRAINT `FK_ProjectItemLocalization_L_LutLanguage` FOREIGN KEY (`Language`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_ProjectItemLocalization_MBLSI_LinkSetting` FOREIGN KEY (`MainButtonLinkSettingId`) REFERENCES `linksetting` (`Id`),
  CONSTRAINT `FK_ProjectItemLocalization_MFEP_Media` FOREIGN KEY (`MediaForExecutePage`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_ProjectItemLocalization_MM_Media` FOREIGN KEY (`MainMedia`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_ProjectItemLocalization_MMFEP_Media` FOREIGN KEY (`MobileMediaForExecutePage`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_ProjectItemLocalization_PFLSI_LinkSetting` FOREIGN KEY (`ProjectFooterLinkSettingId`) REFERENCES `linksetting` (`Id`),
  CONSTRAINT `FK_ProjectItemLocalization_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=115 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `projectitemquickdonationlocalization`
--

DROP TABLE IF EXISTS `projectitemquickdonationlocalization`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projectitemquickdonationlocalization` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `ProjectItemLocalizationId` int NOT NULL,
  `PaymentSum` int NOT NULL,
  `Display` bit(1) NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_PIQDL_PILI_PIL` (`ProjectItemLocalizationId`),
  KEY `FK_ProjectItemQuickDonationLocalization_PS_LutLanguage` (`PaymentSum`),
  KEY `FK_ProjectItemQuickDonationLocalization_CB_User` (`CreatedBy`),
  KEY `FK_ProjectItemQuickDonationLocalization_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_PIQDL_PILI_PIL` FOREIGN KEY (`ProjectItemLocalizationId`) REFERENCES `projectitemlocalization` (`Id`),
  CONSTRAINT `FK_ProjectItemQuickDonationLocalization_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ProjectItemQuickDonationLocalization_PS_LutLanguage` FOREIGN KEY (`PaymentSum`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_ProjectItemQuickDonationLocalization_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `projectlocalization`
--

DROP TABLE IF EXISTS `projectlocalization`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `projectlocalization` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `ProjectId` int NOT NULL,
  `Language` int NOT NULL,
  `DisplayInSite` tinyint(1) NOT NULL,
  `Title` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Description` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `RecruitmentTarget` int DEFAULT NULL,
  `CreditCardTerminalId` int DEFAULT NULL,
  `ContentId` int DEFAULT NULL,
  `MainMedia` int DEFAULT NULL,
  `ImageForListsView` int DEFAULT NULL,
  `HideDonationsInSite` tinyint(1) DEFAULT NULL,
  `OrderInProjectsPageView` int DEFAULT NULL,
  `OrderInListView` int DEFAULT NULL,
  `LinkSettingIdInListView` int DEFAULT NULL,
  `MainLinkButtonSettingId` int DEFAULT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  `LinkSettingIdInButtonListView` int DEFAULT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UK_Project_Lan` (`ProjectId`,`Language`),
  KEY `FK_ProjectLocalization_L_LutLanguage` (`Language`),
  KEY `FK_ProjectLocalization_CCTI_Terminal` (`CreditCardTerminalId`),
  KEY `FK_ProjectLocalization_CI_EntityContent` (`ContentId`),
  KEY `FK_ProjectLocalization_MM_Media` (`MainMedia`),
  KEY `FK_ProjectLocalization_IFLV_Media` (`ImageForListsView`),
  KEY `FK_ProjectLocalization_LSIILV_LinkSetting` (`LinkSettingIdInListView`),
  KEY `FK_ProjectLocalization_MLBSI_LinkSetting` (`MainLinkButtonSettingId`),
  KEY `FK_ProjectLocalization_CB_User` (`CreatedBy`),
  KEY `FK_ProjectLocalization_UB_User` (`UpdatedBy`),
  KEY `FK_ProjectLocalization_LinkSetting` (`LinkSettingIdInButtonListView`),
  CONSTRAINT `FK_ProjectLocalization_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_ProjectLocalization_CCTI_Terminal` FOREIGN KEY (`CreditCardTerminalId`) REFERENCES `terminal` (`Id`),
  CONSTRAINT `FK_ProjectLocalization_CI_EntityContent` FOREIGN KEY (`ContentId`) REFERENCES `entitycontent` (`Id`),
  CONSTRAINT `FK_ProjectLocalization_IFLV_Media` FOREIGN KEY (`ImageForListsView`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_ProjectLocalization_L_LutLanguage` FOREIGN KEY (`Language`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_ProjectLocalization_LinkSetting` FOREIGN KEY (`LinkSettingIdInButtonListView`) REFERENCES `linksetting` (`Id`),
  CONSTRAINT `FK_ProjectLocalization_LSIILV_LinkSetting` FOREIGN KEY (`LinkSettingIdInListView`) REFERENCES `linksetting` (`Id`),
  CONSTRAINT `FK_ProjectLocalization_MLBSI_LinkSetting` FOREIGN KEY (`MainLinkButtonSettingId`) REFERENCES `linksetting` (`Id`),
  CONSTRAINT `FK_ProjectLocalization_MM_Media` FOREIGN KEY (`MainMedia`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_ProjectLocalization_PI_Project` FOREIGN KEY (`ProjectId`) REFERENCES `project` (`Id`),
  CONSTRAINT `FK_ProjectLocalization_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=73 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `recruiter`
--

DROP TABLE IF EXISTS `recruiter`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `recruiter` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Name` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `ProjectId` int DEFAULT NULL,
  `RecruiterGroupId` int DEFAULT NULL,
  `Phone` varchar(15) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `Email` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `RecruitmentTarget` int DEFAULT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UK_Recruiter_Name_ProjectId` (`ProjectId`,`Name`),
  KEY `FK_Recruiter_RGI_RecruitersGroup` (`RecruiterGroupId`),
  KEY `FK_Recruiter_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_Recruiter_SCB_User` (`StatusChangedBy`),
  KEY `FK_Recruiter_CB_User` (`CreatedBy`),
  KEY `FK_Recruiter_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_Recruiter_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Recruiter_PI_Project` FOREIGN KEY (`ProjectId`) REFERENCES `project` (`Id`),
  CONSTRAINT `FK_Recruiter_RGI_RecruitersGroup` FOREIGN KEY (`RecruiterGroupId`) REFERENCES `recruitersgroup` (`Id`),
  CONSTRAINT `FK_Recruiter_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_Recruiter_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Recruiter_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `recruiterlocalization`
--

DROP TABLE IF EXISTS `recruiterlocalization`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `recruiterlocalization` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `RecruiterId` int NOT NULL,
  `LanguageId` int NOT NULL,
  `Name` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `Description` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `DisplayInSite` bit(1) NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_RecruiterLocalization_RI_Recruiter` (`RecruiterId`),
  KEY `FK_RecruiterLocalization_LI_LutLanguage` (`LanguageId`),
  KEY `FK_RecruiterLocalization_CB_User` (`CreatedBy`),
  KEY `FK_RecruiterLocalization_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_RecruiterLocalization_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_RecruiterLocalization_LI_LutLanguage` FOREIGN KEY (`LanguageId`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_RecruiterLocalization_RI_Recruiter` FOREIGN KEY (`RecruiterId`) REFERENCES `recruiter` (`Id`),
  CONSTRAINT `FK_RecruiterLocalization_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `recruitersgroup`
--

DROP TABLE IF EXISTS `recruitersgroup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `recruitersgroup` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Name` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `ProjectId` int NOT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UK_RecruitersGroup_Name_ProjectId` (`ProjectId`,`Name`),
  KEY `FK_RecruitersGroup_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_RecruitersGroup_SCB_User` (`StatusChangedBy`),
  KEY `FK_RecruitersGroup_CB_User` (`CreatedBy`),
  KEY `FK_RecruitersGroup_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_RecruitersGroup_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_RecruitersGroup_PI_Project` FOREIGN KEY (`ProjectId`) REFERENCES `project` (`Id`),
  CONSTRAINT `FK_RecruitersGroup_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_RecruitersGroup_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_RecruitersGroup_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `recruitersgrouplanguage`
--

DROP TABLE IF EXISTS `recruitersgrouplanguage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `recruitersgrouplanguage` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `RecruiterGroupId` int NOT NULL,
  `LanguageId` int NOT NULL,
  `Name` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `Description` varchar(500) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `DisplayInSite` bit(1) NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_RecruitersGroupLanguage_RGI_RecruitersGroup` (`RecruiterGroupId`),
  KEY `FK_RecruitersGroupLanguage_LI_LutLanguage` (`LanguageId`),
  KEY `FK_RecruitersGroupLanguage_CB_User` (`CreatedBy`),
  KEY `FK_RecruitersGroupLanguage_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_RecruitersGroupLanguage_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_RecruitersGroupLanguage_LI_LutLanguage` FOREIGN KEY (`LanguageId`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_RecruitersGroupLanguage_RGI_RecruitersGroup` FOREIGN KEY (`RecruiterGroupId`) REFERENCES `recruitersgroup` (`Id`),
  CONSTRAINT `FK_RecruitersGroupLanguage_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `role`
--

DROP TABLE IF EXISTS `role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `IsSystemValue` bit(1) DEFAULT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_Role_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_Role_SCB_User` (`StatusChangedBy`),
  KEY `FK_Role_CB_User` (`CreatedBy`),
  KEY `FK_Role_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_Role_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Role_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_Role_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Role_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rolepermission`
--

DROP TABLE IF EXISTS `rolepermission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rolepermission` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `RoleId` int NOT NULL,
  `PermissionId` int NOT NULL,
  `Level` int DEFAULT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_RolePermission_RI_Role` (`RoleId`),
  KEY `FK_RolePermission_PI_Permission` (`PermissionId`),
  KEY `FK_RolePermission_L_LutPermissionLevel` (`Level`),
  KEY `FK_RolePermission_CB_User` (`CreatedBy`),
  KEY `FK_RolePermission_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_RolePermission_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_RolePermission_L_LutPermissionLevel` FOREIGN KEY (`Level`) REFERENCES `lutpermissionlevel` (`Id`),
  CONSTRAINT `FK_RolePermission_PI_Permission` FOREIGN KEY (`PermissionId`) REFERENCES `permission` (`Id`),
  CONSTRAINT `FK_RolePermission_RI_Role` FOREIGN KEY (`RoleId`) REFERENCES `role` (`Id`),
  CONSTRAINT `FK_RolePermission_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `source`
--

DROP TABLE IF EXISTS `source`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `source` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `AffiliateId` int NOT NULL,
  `SourceCode` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Description` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_Source_AI_Affiliate` (`AffiliateId`),
  KEY `FK_Source_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_Source_SCB_User` (`StatusChangedBy`),
  KEY `FK_Source_CB_User` (`CreatedBy`),
  KEY `FK_Source_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_Source_AI_Affiliate` FOREIGN KEY (`AffiliateId`) REFERENCES `affiliate` (`Id`),
  CONSTRAINT `FK_Source_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Source_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_Source_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Source_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `supportdata`
--

DROP TABLE IF EXISTS `supportdata`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `supportdata` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Name` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `Value` int DEFAULT NULL,
  `Icon` longblob,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_SupportData_CB_User` (`CreatedBy`),
  KEY `FK_SupportData_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_SupportData_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_SupportData_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `supportdatalocalization`
--

DROP TABLE IF EXISTS `supportdatalocalization`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `supportdatalocalization` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `SupportDataId` int NOT NULL,
  `Language` int NOT NULL,
  `DisplayInSite` bit(1) NOT NULL,
  `Title` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `TextBeforeValue` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `TextAfterValue` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `BudgetType` int DEFAULT NULL,
  `BudgetValue` int DEFAULT NULL,
  `Order` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_SupportDataLocalization_SDI_SupportData` (`SupportDataId`),
  KEY `FK_SupportDataLocalization_L_LutLanguage` (`Language`),
  KEY `FK_SupportDataLocalization_BT_LutPeriodType` (`BudgetType`),
  KEY `FK_SupportDataLocalization_CB_User` (`CreatedBy`),
  KEY `FK_SupportDataLocalization_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_SupportDataLocalization_BT_LutPeriodType` FOREIGN KEY (`BudgetType`) REFERENCES `lutperiodtype` (`Id`),
  CONSTRAINT `FK_SupportDataLocalization_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_SupportDataLocalization_L_LutLanguage` FOREIGN KEY (`Language`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_SupportDataLocalization_SDI_SupportData` FOREIGN KEY (`SupportDataId`) REFERENCES `supportdata` (`Id`),
  CONSTRAINT `FK_SupportDataLocalization_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `terminal`
--

DROP TABLE IF EXISTS `terminal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `terminal` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `Name` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_Terminal_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_Terminal_SCB_User` (`StatusChangedBy`),
  KEY `FK_Terminal_CB_User` (`CreatedBy`),
  KEY `FK_Terminal_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_Terminal_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Terminal_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_Terminal_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Terminal_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `translations`
--

DROP TABLE IF EXISTS `translations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `translations` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `TableName` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `FieldName` varchar(50) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `RecordId` int NOT NULL,
  `Language` int NOT NULL,
  `Translation` varchar(4000) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `TableName` (`TableName`,`FieldName`,`RecordId`,`Language`),
  KEY `FK_Translations_L_LutLanguage` (`Language`),
  KEY `FK_Translations_CB_User` (`CreatedBy`),
  KEY `FK_Translations_UB_User` (`UpdatedBy`),
  CONSTRAINT `FK_Translations_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_Translations_L_LutLanguage` FOREIGN KEY (`Language`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_Translations_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=54 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `FirstName` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `LastName` varchar(300) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Email` varchar(100) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `UserName` varchar(20) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `Password` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci NOT NULL,
  `RoleId` int DEFAULT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UserName` (`UserName`),
  KEY `FK_User_RS_LutRecordStatus` (`RecordStatus`),
  KEY `FK_User_SCB_User` (`StatusChangedBy`),
  KEY `FK_User_CB_User` (`CreatedBy`),
  KEY `FK_User_UB_User` (`UpdatedBy`),
  KEY `FK_User_RI_Role` (`RoleId`),
  CONSTRAINT `FK_User_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_User_RI_Role` FOREIGN KEY (`RoleId`) REFERENCES `role` (`Id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_User_RS_LutRecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_User_SCB_User` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_User_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `videogallerymedia`
--

DROP TABLE IF EXISTS `videogallerymedia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `videogallerymedia` (
  `Id` int NOT NULL AUTO_INCREMENT,
  `LanguageId` int NOT NULL,
  `MediaId` int NOT NULL,
  `Title` varchar(200) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `Description` varchar(500) CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci DEFAULT NULL,
  `DisplayInGallery` bit(1) DEFAULT NULL,
  `DisplayInMainPage` bit(1) DEFAULT NULL,
  `LinkSettingId` int NOT NULL,
  `CreatedAt` datetime NOT NULL,
  `CreatedBy` int NOT NULL,
  `UpdatedAt` datetime NOT NULL,
  `UpdatedBy` int NOT NULL,
  `RecordStatus` int NOT NULL,
  `StatusChangedAt` datetime NOT NULL,
  `StatusChangedBy` int NOT NULL,
  PRIMARY KEY (`Id`),
  KEY `FK_VideoGalleryMedia_LI_LutLanguage` (`LanguageId`),
  KEY `FK_VideoGalleryMedia_MI_Media` (`MediaId`),
  KEY `FK_VideoGalleryMedia_LSI_LinkSetting` (`LinkSettingId`),
  KEY `FK_VideoGalleryMedia_CB_User` (`CreatedBy`),
  KEY `FK_VideoGalleryMedia_UB_User` (`UpdatedBy`),
  KEY `FK_VideoGalleryMedia_RecordStatus` (`RecordStatus`),
  KEY `FK_VideoGalleryMedia_StatusChangedBy` (`StatusChangedBy`),
  CONSTRAINT `FK_VideoGalleryMedia_CB_User` FOREIGN KEY (`CreatedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_VideoGalleryMedia_LI_LutLanguage` FOREIGN KEY (`LanguageId`) REFERENCES `lutlanguage` (`Id`),
  CONSTRAINT `FK_VideoGalleryMedia_LSI_LinkSetting` FOREIGN KEY (`LinkSettingId`) REFERENCES `linksetting` (`Id`),
  CONSTRAINT `FK_VideoGalleryMedia_MI_Media` FOREIGN KEY (`MediaId`) REFERENCES `media` (`Id`),
  CONSTRAINT `FK_VideoGalleryMedia_RecordStatus` FOREIGN KEY (`RecordStatus`) REFERENCES `lutrecordstatus` (`Id`),
  CONSTRAINT `FK_VideoGalleryMedia_StatusChangedBy` FOREIGN KEY (`StatusChangedBy`) REFERENCES `user` (`Id`),
  CONSTRAINT `FK_VideoGalleryMedia_UB_User` FOREIGN KEY (`UpdatedBy`) REFERENCES `user` (`Id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-09-08  8:52:34
