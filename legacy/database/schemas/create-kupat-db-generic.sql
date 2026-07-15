-- Generic SQL Server Database Creation Script for KupatHair
-- This script can be run on any SQL Server instance to create the database structure
-- 
-- Usage:
-- 1. Replace 'KupatHairDB' with your desired database name if needed
-- 2. Run this script in SQL Server Management Studio or sqlcmd
--
-- The script will use SQL Server's default file locations

USE [master]
GO

-- Variables for database name (change this if you want a different name)
DECLARE @DatabaseName NVARCHAR(128) = N'KupatHairDB'

-- Check if database already exists
IF EXISTS (SELECT name FROM sys.databases WHERE name = @DatabaseName)
BEGIN
    PRINT 'Database ' + @DatabaseName + ' already exists. Dropping it first...'
    EXEC('ALTER DATABASE [' + @DatabaseName + '] SET SINGLE_USER WITH ROLLBACK IMMEDIATE')
    EXEC('DROP DATABASE [' + @DatabaseName + ']')
END

-- Create database without specifying file paths (uses SQL Server defaults)
EXEC('CREATE DATABASE [' + @DatabaseName + '] 
 CONTAINMENT = NONE
 ON PRIMARY 
( NAME = N''' + @DatabaseName + ''', SIZE = 1318912KB , MAXSIZE = UNLIMITED, FILEGROWTH = 65536KB )
 LOG ON 
( NAME = N''' + @DatabaseName + '_log'', SIZE = 204800KB , MAXSIZE = 2048GB , FILEGROWTH = 65536KB )
 WITH CATALOG_COLLATION = DATABASE_DEFAULT')

PRINT 'Database ' + @DatabaseName + ' created successfully.'

-- Set database options
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET COMPATIBILITY_LEVEL = 150')

IF (1 = FULLTEXTSERVICEPROPERTY('IsFullTextInstalled'))
BEGIN
    EXEC('EXEC [' + @DatabaseName + '].[dbo].[sp_fulltext_database] @action = ''enable''')
END

-- Configure database settings
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET ANSI_NULL_DEFAULT OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET ANSI_NULLS OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET ANSI_PADDING OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET ANSI_WARNINGS OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET ARITHABORT OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET AUTO_CLOSE OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET AUTO_SHRINK OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET AUTO_UPDATE_STATISTICS ON')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET CURSOR_CLOSE_ON_COMMIT OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET CURSOR_DEFAULT GLOBAL')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET CONCAT_NULL_YIELDS_NULL OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET NUMERIC_ROUNDABORT OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET QUOTED_IDENTIFIER OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET RECURSIVE_TRIGGERS OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET DISABLE_BROKER')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET AUTO_UPDATE_STATISTICS_ASYNC OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET DATE_CORRELATION_OPTIMIZATION OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET TRUSTWORTHY OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET ALLOW_SNAPSHOT_ISOLATION OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET PARAMETERIZATION SIMPLE')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET READ_COMMITTED_SNAPSHOT OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET HONOR_BROKER_PRIORITY OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET RECOVERY SIMPLE')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET MULTI_USER')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET PAGE_VERIFY CHECKSUM')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET DB_CHAINING OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET FILESTREAM( NON_TRANSACTED_ACCESS = OFF )')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET TARGET_RECOVERY_TIME = 60 SECONDS')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET DELAYED_DURABILITY = DISABLED')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET ACCELERATED_DATABASE_RECOVERY = OFF')
EXEC('ALTER DATABASE [' + @DatabaseName + '] SET QUERY_STORE = OFF')

PRINT 'Database configuration completed successfully.'
PRINT 'Now you need to switch to the new database and run the rest of the schema creation...'

-- Switch to the new database for creating objects
USE [KupatHairDB]  -- Change this if you used a different database name above
GO

-- From here, you would continue with the rest of the original script
-- (functions, tables, stored procedures, etc.)
-- All the CREATE TABLE, CREATE FUNCTION, etc. statements from the original file


-- ========== SCHEMA OBJECTS ==========
USE [KupatHairDB]
GO
/****** Object:  UserDefinedFunction [dbo].[ContainsMaliciousCode]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE FUNCTION [dbo].[ContainsMaliciousCode] (@input NVARCHAR(MAX),@EasyCheck BIT=0,@AllowUrl BIT=0)
RETURNS BIT
AS
BEGIN
    DECLARE @ContainsMaliciousCode BIT = 0;
	set @input = LOWER(@input)
    IF @input LIKE '%waitfor%' OR 
       @input LIKE '%select %' OR
     @input LIKE '%sleep%' OR 
      @input LIKE '%select(%' OR  
	  @input LIKE '%delay%' OR 
	    @input LIKE '%=%' OR 
	 (@AllowUrl=0 and  @input LIKE '%http%' ) OR 
	 
		
      
(@EasyCheck=0 and
      (
       @input LIKE '%/%' OR
	 @input LIKE '%\%' OR 
	 @input LIKE '%(%' OR 
	    @input LIKE '%?%' OR 
	 	   @input LIKE '%}%' OR 
       @input LIKE '%{%' OR
       @input LIKE '%)%'  )) 
       
    
    BEGIN
        SET @ContainsMaliciousCode = 1;
    END

    RETURN @ContainsMaliciousCode;
END;

GO
/****** Object:  UserDefinedFunction [dbo].[getprayernames]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE FUNCTION [dbo].[getprayernames]
	(
	@order_id int	
	)
	
RETURNS nvarchar(max)

AS
Begin

	DECLARE @CodeNameString  nvarchar(max)	    
	select  @CodeNameString = COALESCE(@CodeNameString + ',', '')  + Cast((FirstName + ' ' + 
	(case when Gender = 0 then '׳‘׳' else '׳‘׳×' end) +
	 ' ' + LastName + ', ' + Comment) as nvarchar) from PrayerNames where orderid = @order_id

	RETURN @CodeNameString
END

GO
/****** Object:  UserDefinedFunction [dbo].[getPrayerNamesByOrderId]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE FUNCTION [dbo].[getPrayerNamesByOrderId]
	(
	@order_id int	
	)
	
RETURNS nvarchar(max)

AS
Begin

	DECLARE @CodeNameString  nvarchar(max)	    
	select  @CodeNameString = COALESCE(@CodeNameString + ',', '')  + ((FirstName + ' ' + 
	(case when Gender = 0 then '׳‘׳' else '׳‘׳×' end) +
	 ' ' + LastName + ', ' + Comment) ) from PrayerNames where orderid = @order_id

	RETURN @CodeNameString
END

GO
/****** Object:  UserDefinedFunction [dbo].[quotestring]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
Create FUNCTION [dbo].[quotestring](@str nvarchar(MAX), @sq nchar(1)) RETURNS nvarchar(MAX) AS
BEGIN
   DECLARE @ret nvarchar(MAX)--,
           --@sq  nchar(1) = ''''
   SELECT @ret = replace(@str, @sq, @sq + @sq)
   RETURN(@sq + @ret + @sq)
END
GO
/****** Object:  Table [dbo].[UserSources]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[UserSources](
	[UserSourcesId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](200) NULL,
	[ExpirationNum] [int] NULL,
	[ParentSourcesId] [int] NULL,
	[Title] [nvarchar](2000) NULL,
 CONSTRAINT [PK_UserSources] PRIMARY KEY CLUSTERED 
(
	[UserSourcesId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ParentSources]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ParentSources](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](500) NULL,
	[Code] [nvarchar](500) NULL,
	[Password] [nvarchar](50) NULL,
	[UserName] [nvarchar](50) NULL,
 CONSTRAINT [PK_ParentSources] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  View [dbo].[SourcesView]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE VIEW [dbo].[SourcesView]
AS
SELECT        dbo.UserSources.UserSourcesId, RTRIM(LTRIM(isnull(dbo.UserSources.Name, ''))) AS Source, dbo.ParentSources.Name AS ParentSource,
				dbo.UserSources.ExpirationNum, dbo.UserSources.ParentSourcesId, dbo.UserSources.Title
FROM            dbo.UserSources LEFT OUTER JOIN
                         dbo.ParentSources ON dbo.UserSources.ParentSourcesId = dbo.ParentSources.Id

GO
/****** Object:  Table [dbo].[Orders]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Orders](
	[OrdersId] [int] IDENTITY(1,1) NOT NULL,
	[UserId] [int] NOT NULL,
	[StatusId] [int] NOT NULL,
	[Total] [float] NOT NULL,
	[Payments] [int] NOT NULL,
	[ShippingMethod] [int] NULL,
	[PaymentMethod] [varchar](50) NULL,
	[BillingAddress1] [nvarchar](500) NULL,
	[BillingAddress2] [nvarchar](500) NULL,
	[BillingCity] [nvarchar](200) NULL,
	[BillingCountry] [nvarchar](50) NULL,
	[BillingState] [nvarchar](50) NULL,
	[BillingZip] [nvarchar](50) NULL,
	[ShippingAddress1] [nvarchar](500) NULL,
	[ShippingAddress2] [nvarchar](500) NULL,
	[ShippingCity] [nvarchar](200) NULL,
	[ShippingCountry] [nvarchar](50) NULL,
	[ShippingState] [nvarchar](50) NULL,
	[ShippingZip] [nvarchar](50) NULL,
	[ShippingStreet] [nvarchar](500) NULL,
	[ShippingHouseNum] [nvarchar](50) NULL,
	[ShippingFloorNum] [nvarchar](50) NULL,
	[ShippingApartNum] [nvarchar](50) NULL,
	[DateCreated] [datetime] NULL,
	[UserComments] [nvarchar](max) NULL,
	[UserFullName] [nvarchar](500) NULL,
	[OrderContent] [int] NULL,
	[AdminComments] [nvarchar](max) NULL,
	[ReferenceCode] [nvarchar](50) NULL,
	[OrderLog] [nvarchar](max) NULL,
	[CardToken] [varchar](50) NULL,
	[CardNum] [varchar](50) NULL,
	[CardExp] [varchar](50) NULL,
	[ChargeStatus] [varchar](50) NULL,
	[Discount] [float] NOT NULL,
	[CardAuthNum] [varchar](50) NULL,
	[CardHolderId] [varchar](50) NULL,
	[BillingStreet] [nvarchar](500) NULL,
	[BillingHouseNum] [nvarchar](50) NULL,
	[BillingFloorNum] [nvarchar](50) NULL,
	[BillingApartNum] [nvarchar](50) NULL,
	[Phone] [nvarchar](50) NULL,
	[ShippingFirstName] [nvarchar](50) NULL,
	[ShippingLastName] [nvarchar](50) NULL,
	[ChargeResultNum] [nvarchar](50) NULL,
	[ChargeErrorDesc] [nvarchar](max) NULL,
	[DiscountDescription] [nvarchar](500) NULL,
	[ProjectId] [int] NULL,
	[ProjectName] [nvarchar](500) NULL,
	[DonationType] [varchar](50) NULL,
	[Email] [varchar](50) NULL,
	[BillingFirstName] [nvarchar](100) NULL,
	[BillingLastName] [nvarchar](50) NULL,
	[CardValidityMonth] [nvarchar](50) NULL,
	[CardValidityYear] [nvarchar](50) NULL,
	[TokenApprovalNumber] [nvarchar](1000) NULL,
	[TokenExDate] [nvarchar](50) NULL,
	[isCharged] [int] NULL,
	[LowProfileDealGuid] [nvarchar](max) NULL,
	[UserSource] [nvarchar](200) NULL,
	[PrayerNames] [int] NULL,
	[OrderLaguage] [varchar](50) NULL,
	[AnonymousUser] [bit] NULL,
	[PrayerId] [int] NULL,
	[DonationDescription] [nvarchar](500) NULL,
	[ProjectNumber] [varchar](50) NULL,
	[ShippingPrice] [float] NOT NULL,
	[Tax] [float] NOT NULL,
	[FirstPayment] [float] NULL,
	[ConstPayment] [float] NULL,
	[CardOwnerName] [nvarchar](500) NULL,
	[InternalDealNumber] [nvarchar](500) NULL,
	[Currency] [varchar](50) NOT NULL,
	[ExtraField] [int] NULL,
	[RecruiterId] [int] NOT NULL,
	[AnonymousUserName] [bit] NULL,
	[ChargeCurrency] [nvarchar](50) NULL,
	[ChargeTotal] [float] NULL,
	[OrderNotFinishedNotification] [bit] NULL,
	[AsakimInvoiceID] [nvarchar](500) NULL,
	[TerminalNumber] [nvarchar](500) NULL,
	[ProjectNameForInvoice] [nvarchar](max) NULL,
	[InvoiceLink] [nvarchar](2000) NULL,
	[InvoiceSent] [bit] NULL,
	[AbandonedCartCreated] [bit] NULL,
	[RemarketyOrderCreated] [bit] NULL,
	[Ip] [varchar](200) NULL,
	[CertificateFullName] [nvarchar](500) NULL,
	[CertificateStreet] [nvarchar](500) NULL,
	[CertificateCity] [nvarchar](200) NULL,
	[CertificateCountry] [nvarchar](50) NULL,
	[CertificateZip] [nvarchar](50) NULL,
	[VoucherAccountNum] [nvarchar](50) NULL,
	[IsManualDonation] [bit] NULL,
	[TotalInILS] [float] NULL,
	[TotalInUSD] [float] NULL,
	[TotalInEUR] [float] NULL,
	[USDRate] [float] NULL,
	[EURRate] [float] NULL,
	[DealNumberForExtractCardDetails] [nvarchar](50) NULL,
	[ClearingProvider] [nvarchar](100) NULL,
	[AsakimID] [varchar](50) NULL,
 CONSTRAINT [PK_Orders] PRIMARY KEY CLUSTERED 
(
	[OrdersId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Prayers]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Prayers](
	[PrayersId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](500) NULL,
	[Name_en] [nvarchar](500) NULL,
	[Name_fr] [nvarchar](500) NULL,
	[Hide] [int] NULL,
	[Price] [float] NULL,
	[Sort] [int] NULL,
	[Hide_en] [int] NULL,
	[Hide_fr] [int] NULL,
	[Price_en] [float] NULL,
	[Price_fr] [float] NULL,
	[ShortName] [nvarchar](500) NULL,
	[ShortName_en] [nvarchar](500) NULL,
	[ShortName_fr] [nvarchar](500) NULL,
 CONSTRAINT [PK_Prayers] PRIMARY KEY CLUSTERED 
(
	[PrayersId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Products]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Products](
	[productsid] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](max) NULL,
	[CatId] [int] NOT NULL,
	[Price] [real] NOT NULL,
	[Pic] [nvarchar](50) NULL,
	[DateCreated] [datetime] NULL,
	[Hide] [int] NULL,
	[ShortDescription] [varchar](1000) NULL,
	[Sort] [int] NULL,
	[Description] [nvarchar](max) NULL,
	[Pic2] [nvarchar](50) NULL,
	[Pic3] [nvarchar](50) NULL,
	[Pic4] [nvarchar](50) NULL,
	[Pic5] [nvarchar](50) NULL,
	[Name_en] [nvarchar](max) NULL,
	[ShortDescription_en] [varchar](1000) NULL,
	[Description_en] [nvarchar](max) NULL,
	[Pic_en] [nvarchar](50) NULL,
	[ShowMainPage] [int] NULL,
	[Similar] [varchar](500) NULL,
	[MetaTitle] [nvarchar](50) NULL,
	[MetaDescription] [nvarchar](500) NULL,
	[MetaKeywords] [nvarchar](500) NULL,
	[MetaTitle_en] [varchar](200) NULL,
	[MetaDescription_en] [varchar](500) NULL,
	[MetaKeywords_en] [varchar](500) NULL,
	[ProjectType] [int] NULL,
	[EndDate] [datetime] NULL,
	[Name_fr] [nvarchar](max) NULL,
	[ShortDescription_fr] [nvarchar](1000) NULL,
	[Description_fr] [nvarchar](max) NULL,
	[MetaTitle_fr] [nvarchar](200) NULL,
	[MetaDescription_fr] [nvarchar](500) NULL,
	[MetaKeywords_fr] [nvarchar](500) NULL,
	[Pic_fr] [nvarchar](50) NULL,
	[ShowInLanguage] [varchar](50) NULL,
	[ProjectUpdates] [int] NULL,
	[ProjectNumber] [varchar](50) NULL,
	[AddDonation] [real] NOT NULL,
	[Hide_en] [int] NULL,
	[Hide_fr] [int] NULL,
	[AddDonationCount] [int] NOT NULL,
	[Price_en] [real] NOT NULL,
	[Price_fr] [real] NOT NULL,
	[ProjectVideo] [nvarchar](max) NULL,
	[ProjectVideo_en] [nvarchar](max) NULL,
	[ProjectVideo_fr] [nvarchar](max) NULL,
	[OGTitle_en] [varchar](200) NULL,
	[OGDescription_en] [varchar](500) NULL,
	[OGKeywords_en] [varchar](500) NULL,
	[OGTitle_fr] [nvarchar](200) NULL,
	[OGDescription_fr] [nvarchar](500) NULL,
	[OGKeywords_fr] [nvarchar](500) NULL,
	[OGTitle] [nvarchar](200) NULL,
	[OGDescription] [nvarchar](500) NULL,
	[OGKeywords] [nvarchar](500) NULL,
	[ShowPrayerNames] [bit] NULL,
	[DefaultPaymentsNumber_en] [int] NULL,
	[DefaultPaymentsNumber_fr] [int] NULL,
	[DefaultPaymentsNumber] [int] NULL,
	[DefaultDonationsSum] [int] NULL,
	[DefaultDonationsSum_en] [int] NULL,
	[DefaultDonationsSum_fr] [int] NULL,
	[DonationLink] [nvarchar](2000) NULL,
	[DonationLink_en] [nvarchar](2000) NULL,
	[DonationLink_fr] [nvarchar](2000) NULL,
	[ProjectNameForInvoice] [nvarchar](2000) NULL,
	[ProjectNameForInvoice_en] [nvarchar](2000) NULL,
	[ProjectNameForInvoice_fr] [nvarchar](2000) NULL,
	[DefaultPaymentsNumFixed] [int] NULL,
	[DefaultDonationSumFixed] [int] NULL,
	[DefaultPaymentsNumFixed_en] [int] NULL,
	[DefaultPaymentsNumFixed_fr] [int] NULL,
	[DefaultDonationSumFixed_en] [int] NULL,
	[DefaultDonationSumFixed_fr] [int] NULL,
	[DonationPageBanner1] [nvarchar](500) NULL,
	[DonationPageBanner1_en] [nvarchar](500) NULL,
	[DonationPageBanner1_fr] [nvarchar](500) NULL,
	[HideDonationAmount] [bit] NULL,
	[ProjectNameForDonationPage] [nvarchar](2000) NULL,
	[Certificate] [bit] NULL,
	[DisplayAsGroup] [bit] NULL,
	[Terminal] [int] NULL,
	[WithoutKupatView] [bit] NULL,
 CONSTRAINT [PK_dbo.products] PRIMARY KEY CLUSTERED 
(
	[productsid] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ProductStock]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProductStock](
	[ProductStockId] [int] IDENTITY(1,1) NOT NULL,
	[ProductId] [int] NULL,
	[Name] [nvarchar](max) NULL,
	[Hide] [int] NULL,
	[Name_en] [nvarchar](max) NULL,
	[Name_fr] [nvarchar](max) NULL,
	[Hide_en] [int] NULL,
	[Hide_fr] [int] NULL,
	[Pic] [nvarchar](500) NULL,
	[Param] [nvarchar](200) NULL,
	[Price] [float] NULL,
	[Price_en] [float] NULL,
	[Price_fr] [float] NULL,
	[GroupId] [int] NULL,
 CONSTRAINT [PK_ProductStock] PRIMARY KEY CLUSTERED 
(
	[ProductStockId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  View [dbo].[OrdersViewHe]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO


CREATE VIEW [dbo].[OrdersViewHe]
AS
SELECT        O.*, V.*, V1.*, V2.*, V3.*
FROM            (SELECT        OrdersId, UserId, BillingFirstName, BillingLastName, BillingStreet, BillingCity, BillingZip, BillingCountry, Phone, dbo.Orders.DateCreated, 
                                                    (CASE WHEN DonationType = 'FixedDonation' THEN (CASE WHEN Payments = 1000 THEN isnull(Total, 0) * 30 ELSE isnull(Payments, 1) * Total END) ELSE Total END) AS TotalExtended, Total, PaymentMethod, 
                                                    DonationType, Currency, InternalDealNumber, CardValidityMonth + '/' + CardValidityYear AS CardValidDate, CardNum, UserSource, AnonymousUser, OrderLaguage, AdminComments, UserComments, ChargeStatus, 
                                                    ChargeErrorDesc, Payments, FirstPayment, Email, CardHolderId, dbo.Orders.ProjectNumber, AsakimInvoiceID, ProjectId, PrayerId, 
                                                    RecruiterId, CertificateFullName, CertificateStreet, CertificateCity, CertificateCountry, DealNumberForExtractCardDetails,ClearingProvider , TerminalNumber
                          /*ISNULL(dbo.Products.Name, '') AS prjName,  ISNULL(dbo.Prayers.Name, '') AS prayerName, */ FROM dbo.Orders) O OUTER apply
                             (SELECT        TOP 1 ISNULL(Name, '') AS prjName, Certificate
                               FROM            dbo.Products P
                               WHERE        P.productsid = O.ProjectId) V OUTER apply
                             (SELECT        TOP 1 ISNULL(Name, '') AS prayerName
                               FROM            dbo.Prayers Pr
                               WHERE        Pr.PrayersId = O.PrayerId) V1 OUTER apply
                             (SELECT        TOP 1 ISNULL(Name, '') AS RecruiterName
                               FROM            dbo.ProductStock Ps
                               WHERE        Ps.ProductStockId = O.RecruiterId) V2 OUTER apply
                             (SELECT        TOP 1 ISNULL(ParentSource, '') AS ParentSourceName
                               FROM            dbo.SourcesView Ps
                               WHERE        Ps.Source = O.UserSource) V3
WHERE        (OrderLaguage = 'he') and PaymentMethod <> 'NedarimPlus'
GO
/****** Object:  View [dbo].[OrdersViewEn]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO


CREATE VIEW [dbo].[OrdersViewEn]
AS
SELECT O.*, V.*, V1.*, V2.*, V3.* from (
SELECT        OrdersId, UserId, BillingFirstName, BillingLastName, BillingStreet, BillingCity, BillingZip, BillingCountry, Phone, Email, DateCreated, 
                         (CASE WHEN DonationType = 'FixedDonation' THEN (CASE WHEN Payments = 1000 THEN isnull(Total, 0) * 30 ELSE isnull(Payments, 1) * Total END) ELSE Total END) AS TotalExtended,
						 Total, PaymentMethod, DonationType, ChargeStatus, FirstPayment,
						 Currency, InternalDealNumber, CardValidityMonth + '/' + CardValidityYear AS CardValidDate, CardNum, UserSource, AnonymousUser, OrderLaguage, 
                         AdminComments, UserComments, ChargeErrorDesc, Payments, CardHolderId, ProjectNumber, ChargeTotal, ChargeCurrency,ProjectId ,PrayerId,RecruiterId,
						 CertificateFullName, CertificateStreet, CertificateCity, CertificateCountry, VoucherAccountNum
						 from dbo.Orders) O
				outer apply (select top 1 ISNULL(Name_en, '') AS prjName, Certificate from dbo.Products P where P.productsid = O.ProjectId) V
				outer apply (select top 1 ISNULL(Name_en, '') AS prayerName from dbo.Prayers Pr where Pr.PrayersId = O.PrayerId) V1
				outer apply (select top 1 ISNULL(Name_en, ISNULL(Name,'')) AS RecruiterName from dbo.ProductStock Ps where Ps.ProductStockId = O.RecruiterId) V2
                outer apply (select top 1 ISNULL(ParentSource, '') AS ParentSourceName from dbo.SourcesView Ps where Ps.Source = O.UserSource) V3
WHERE        (OrderLaguage = 'en')
GO
/****** Object:  View [dbo].[OrdersViewFr]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO


CREATE VIEW [dbo].[OrdersViewFr]
AS
SELECT O.*, V.*, V1.*, V2.*, V3.* from (
SELECT        OrdersId, UserId, BillingFirstName, BillingLastName, BillingStreet, BillingCity, BillingZip, BillingCountry, Phone, Email, DateCreated, 
						(CASE WHEN DonationType = 'FixedDonation' THEN (CASE WHEN Payments = 1000 THEN isnull(Total, 0) * 30 ELSE isnull(Payments, 1) * Total END) ELSE Total END) AS TotalExtended, 
						Total, PaymentMethod, DonationType, ChargeStatus, FirstPayment, Currency, InternalDealNumber, 
						CardValidityMonth + '/' + CardValidityYear AS CardValidDate, CardNum, UserSource, AnonymousUser, OrderLaguage, 
						AdminComments, UserComments, ChargeErrorDesc, Payments, CardHolderId, ProjectNumber, ProjectId, PrayerId, RecruiterId,
						CertificateFullName, CertificateStreet, CertificateCity, CertificateCountry, CertificateZip
						FROM dbo.Orders) O 
				outer apply (select top 1 ISNULL(Name_fr, '') AS prjName, Certificate from dbo.Products P where P.productsid = O.ProjectId) V
				outer apply (select top 1 ISNULL(Name_fr, '') AS prayerName from dbo.Prayers Pr where Pr.PrayersId = O.PrayerId) V1
				outer apply (select top 1 ISNULL(Name_fr, ISNULL(Name_en, ISNULL(Name,''))) AS RecruiterName from dbo.ProductStock Ps where Ps.ProductStockId = O.RecruiterId) V2
                outer apply (select top 1 ISNULL(ParentSource, '') AS ParentSourceName from dbo.SourcesView Ps where Ps.Source = O.UserSource) V3
		WHERE        (OrderLaguage = 'fr')

GO
/****** Object:  View [dbo].[OrdersTotalsView]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE VIEW [dbo].[OrdersTotalsView]
AS
SELECT        dbo.Orders.OrdersId, dbo.Orders.UserId, dbo.Orders.StatusId, (CASE WHEN DonationType = 'FixedDonation' THEN (CASE WHEN Payments = 1000 THEN isnull(Total, 0) * 30 ELSE isnull(Payments, 1) * Total END) 
                         ELSE Total END) AS TotalExtended, dbo.Orders.Total, dbo.Orders.Payments, dbo.Orders.ShippingMethod, dbo.Orders.PaymentMethod, dbo.Orders.BillingAddress1, dbo.Orders.BillingAddress2, dbo.Orders.BillingCity, 
                         dbo.Orders.BillingCountry, dbo.Orders.BillingState, dbo.Orders.BillingZip, dbo.Orders.ShippingAddress1, dbo.Orders.ShippingAddress2, dbo.Orders.ShippingCity, dbo.Orders.ShippingCountry, dbo.Orders.ShippingState, 
                         dbo.Orders.ShippingZip, dbo.Orders.ShippingStreet, dbo.Orders.ShippingHouseNum, dbo.Orders.ShippingFloorNum, dbo.Orders.ShippingApartNum, dbo.Orders.DateCreated, dbo.Orders.UserComments, 
                         dbo.Orders.UserFullName, dbo.Orders.OrderContent, dbo.Orders.AdminComments, dbo.Orders.ReferenceCode, dbo.Orders.OrderLog, dbo.Orders.CardToken, dbo.Orders.CardNum, dbo.Orders.CardExp, dbo.Orders.ChargeStatus, 
                         dbo.Orders.Discount, dbo.Orders.CardAuthNum, dbo.Orders.CardHolderId, dbo.Orders.BillingStreet, dbo.Orders.BillingHouseNum, dbo.Orders.BillingFloorNum, dbo.Orders.BillingApartNum, dbo.Orders.Phone, 
                         dbo.Orders.ShippingFirstName, dbo.Orders.ShippingLastName, dbo.Orders.ChargeResultNum, dbo.Orders.ChargeErrorDesc, dbo.Orders.DiscountDescription, dbo.Orders.ProjectId, dbo.Orders.ProjectName, 
                         dbo.Orders.DonationType, dbo.Orders.Email, dbo.Orders.BillingFirstName, dbo.Orders.BillingLastName, dbo.Orders.CardValidityMonth, dbo.Orders.CardValidityYear, dbo.Orders.TokenApprovalNumber, dbo.Orders.TokenExDate,
                         dbo.Orders.isCharged, dbo.Orders.LowProfileDealGuid, RTRIM(LTRIM(ISNULL(dbo.Orders.UserSource, ''))) AS UserSource, dbo.Orders.PrayerNames, dbo.Orders.OrderLaguage, dbo.Orders.AnonymousUser, 
                         -- dbo.Orders.isCharged, dbo.Orders.LowProfileDealGuid, RTRIM(LTRIM(CASE WHEN dbo.UserSources.UserSourcesId IS NULL or dbo.Orders.UserSource IS NULL or dbo.Orders.UserSource LIKE 'recparam%' THEN '' ELSE dbo.Orders.UserSource END)) AS UserSource,
						 --CASE WHEN dbo.UserSources.UserSourcesId IS NULL or dbo.Orders.UserSource IS NULL or dbo.Orders.UserSource LIKE 'recparam%' THEN -1 ELSE dbo.UserSources.UserSourcesId END AS UserSourceID,						 
						 --dbo.Orders.PrayerNames, dbo.Orders.OrderLaguage, dbo.Orders.AnonymousUser, 
                         dbo.Orders.PrayerId, dbo.Orders.DonationDescription, dbo.Orders.ProjectNumber, dbo.Orders.ShippingPrice, dbo.Orders.Tax, dbo.Orders.FirstPayment, dbo.Orders.ConstPayment, dbo.Orders.CardOwnerName, 
                         dbo.Orders.InternalDealNumber, dbo.Orders.Currency, dbo.Orders.ExtraField, dbo.Orders.RecruiterId, dbo.Orders.AnonymousUserName, dbo.Orders.ChargeCurrency, dbo.Orders.ChargeTotal, 
                         dbo.Orders.OrderNotFinishedNotification, dbo.Orders.AsakimInvoiceID, dbo.Orders.TerminalNumber, dbo.Orders.ProjectNameForInvoice, dbo.UserSources.Title AS SourceTitle, ISNULL(dbo.ParentSources.Id, 0) 
                         AS ParentSourceId
						 ,(CASE WHEN dbo.ParentSources.Name IS NULL THEN (CASE WHEN UserSource LIKE 'recparam%' THEN '׳×׳¨׳•׳׳•׳× ׳׳׳’׳™׳™׳¡׳™׳' ELSE (CASE WHEN UserSource = '' THEN '׳׳׳ ׳׳§׳•׳¨' ELSE '׳׳׳ ׳©׳™׳•׳' END) END) 
                         ELSE dbo.ParentSources.Name END) AS ParentSourceName
FROM            dbo.Orders LEFT OUTER JOIN
                         dbo.UserSources ON dbo.Orders.UserSource = dbo.UserSources.Name LEFT OUTER JOIN
                         dbo.ParentSources ON dbo.UserSources.ParentSourcesId = dbo.ParentSources.Id
						  --where DateCreated > '2023-07-27' and PaymentMethod<>'NedarimPlus'

GO
/****** Object:  View [dbo].[ProjectTotalsEnView]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE VIEW [dbo].[ProjectTotalsEnView]
AS
SELECT        dbo.Products.productsid AS ProjectId, SUM(CASE WHEN dbo.Orders.DonationType = 'FixedDonation' THEN dbo.Orders.Total * isnull((CASE WHEN dbo.Orders.Payments = 1000 THEN 30 ELSE dbo.Orders.Payments END), 1) 
                         ELSE Total END) AS Total, COUNT(dbo.Orders.OrdersId) AS OrdersCount
FROM            dbo.Orders INNER JOIN
                         dbo.Products ON dbo.Orders.ProjectId = dbo.Products.productsid AND dbo.Orders.ChargeStatus = 'orderfinished' AND dbo.Orders.OrderLaguage = 'en'
GROUP BY dbo.Products.productsid

GO
/****** Object:  View [dbo].[ProjectTotalsFrView]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE VIEW [dbo].[ProjectTotalsFrView]
AS
SELECT        dbo.Products.productsid AS ProjectId, SUM(CASE WHEN dbo.Orders.DonationType = 'FixedDonation' THEN dbo.Orders.Total * isnull((CASE WHEN dbo.Orders.Payments = 1000 THEN 30 ELSE dbo.Orders.Payments END), 1) 
                         ELSE Total END) AS Total, COUNT(dbo.Orders.OrdersId) AS OrdersCount
FROM            dbo.Orders INNER JOIN
                         dbo.Products ON dbo.Orders.ProjectId = dbo.Products.productsid AND dbo.Orders.ChargeStatus = 'orderfinished' AND dbo.Orders.OrderLaguage = 'fr'
GROUP BY dbo.Products.productsid

GO
/****** Object:  View [dbo].[ProjectTotalsHeView]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE VIEW [dbo].[ProjectTotalsHeView]
AS
SELECT        dbo.Products.productsid AS ProjectId, SUM(CASE WHEN dbo.Orders.DonationType = 'FixedDonation' THEN 
			dbo.Orders.Total * isnull((CASE WHEN dbo.Orders.Payments = 1000 THEN 30 ELSE dbo.Orders.Payments END), 1) ELSE Total END) AS Total, 
			COUNT(dbo.Orders.OrdersId) AS OrdersCount
FROM            dbo.Orders INNER JOIN
                         dbo.Products ON dbo.Orders.ProjectId = dbo.Products.productsid AND dbo.Orders.ChargeStatus = 'orderfinished' AND dbo.Orders.OrderLaguage = 'he'
GROUP BY dbo.Products.productsid

GO
/****** Object:  View [dbo].[ProjectTotalsView]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE VIEW [dbo].[ProjectTotalsView]
AS
SELECT        dbo.Products.productsid AS ProjectId, dbo.Products.Name AS ProjectTitle, 
			CONVERT(FLOAT, dbo.Products.Price) AS ProjectTarget, ISNULL(dbo.ProjectTotalsFrView.Total, 0) AS TotalFr, 
			ISNULL(dbo.ProjectTotalsEnView.Total, 0) AS TotalEn, ISNULL(dbo.ProjectTotalsHeView.Total, 0) AS TotalHe, 
			ISNULL(dbo.ProjectTotalsFrView.OrdersCount, 0) AS CountFr, ISNULL(dbo.ProjectTotalsEnView.OrdersCount, 0) AS CountEn, 
			ISNULL(dbo.ProjectTotalsHeView.OrdersCount, 0) AS CountHe
FROM            dbo.Products LEFT OUTER JOIN
                         dbo.ProjectTotalsHeView ON dbo.Products.productsid = dbo.ProjectTotalsHeView.ProjectId LEFT OUTER JOIN
                         dbo.ProjectTotalsEnView ON dbo.Products.productsid = dbo.ProjectTotalsEnView.ProjectId LEFT OUTER JOIN
                         dbo.ProjectTotalsFrView ON dbo.Products.productsid = dbo.ProjectTotalsFrView.ProjectId
WHERE        (dbo.Products.Hide <> 1)

GO
/****** Object:  View [dbo].[ProjectTotalsSiteView]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO


CREATE VIEW [dbo].[ProjectTotalsSiteView]
AS
SELECT        dbo.Products.productsid AS ProjectId, dbo.Products.Name AS ProjectTitle, CONVERT(FLOAT, dbo.Products.Price) AS ProjectTarget, 
				ISNULL(dbo.ProjectTotalsFrView.Total, 0) AS TotalFr, ISNULL(dbo.ProjectTotalsEnView.Total, 0) AS TotalEn, 
				ISNULL(dbo.ProjectTotalsHeView.Total, 0) AS TotalHe, 
				ISNULL(dbo.ProjectTotalsFrView.OrdersCount, 0) AS CountFr, ISNULL(dbo.ProjectTotalsEnView.OrdersCount, 0) AS CountEn, 
				ISNULL(dbo.ProjectTotalsHeView.OrdersCount, 0) AS CountHe
FROM            dbo.Products LEFT OUTER JOIN
                         dbo.ProjectTotalsHeView ON dbo.Products.productsid = dbo.ProjectTotalsHeView.ProjectId LEFT OUTER JOIN
                         dbo.ProjectTotalsEnView ON dbo.Products.productsid = dbo.ProjectTotalsEnView.ProjectId LEFT OUTER JOIN
                         dbo.ProjectTotalsFrView ON dbo.Products.productsid = dbo.ProjectTotalsFrView.ProjectId
WHERE        (dbo.Products.Hide <> 1)

GO
/****** Object:  View [dbo].[OrderByProductsView]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO



CREATE VIEW [dbo].[OrderByProductsView]
AS
SELECT --(CASE WHEN DonationType = 'FixedDonation' THEN Total * isnull((CASE WHEN Payments = 1000 THEN 30 ELSE Payments END), 1) ELSE Total END) AS Total, 
        Total, TotalInILS, TotalInUSD, TotalInEUR,
		RecruiterId, OrdersId, ProjectId, DateCreated, OrderLaguage, BillingFirstName, BillingLastName, AnonymousUser, UserSource, AnonymousUserName, UserFullName
FROM    dbo.Orders
WHERE   (ChargeStatus = 'orderfinished') AND (ISNULL(ProjectId, 0) > 0)

GO
/****** Object:  Table [dbo].[NadarimDonations]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[NadarimDonations](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[ProjectId] [int] NULL,
	[Total] [float] NULL,
	[DateCreated] [datetime] NULL,
	[BillingFirstName] [nvarchar](500) NULL,
	[BillingLastName] [nvarchar](500) NULL,
	[AnonymousUser] [bit] NULL,
	[UserSource] [nvarchar](50) NULL,
	[AnonymousUserName] [bit] NULL,
	[UserFullName] [nvarchar](500) NULL,
	[DonationId] [int] NULL,
	[OrderLaguage] [nvarchar](50) NULL,
	[recruiterid] [int] NULL,
	[TotalInUSD] [float] NULL,
	[TotalInEUR] [float] NULL,
 CONSTRAINT [PK_NdarimDonations] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  View [dbo].[OrderByProductsSiteView]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE VIEW [dbo].[OrderByProductsSiteView]
AS
SELECT O.OrdersId, O.DonationId, O.ProjectId, O.Total, O.TotalInILS, O.TotalInUSD, O.TotalInEUR, O.DateCreated, O.OrderLaguage, O.BillingFirstName, O.BillingLastName, O.AnonymousUser, O.UserSource, O.AnonymousUserName, O.UserFullName, O.RecruiterId, O.orderkey, P.Price, P.Price_en, P.Price_fr
FROM   (SELECT OrdersId, OrdersId AS DonationId, ProjectId, Total, TotalInILS, TotalInUSD, TotalInEUR, DateCreated, OrderLaguage, BillingFirstName, BillingLastName, AnonymousUser, UserSource, AnonymousUserName, CAST(UserFullName AS nvarchar) AS UserFullName, RecruiterId, CAST(ProjectId AS varchar) 
                           + CAST(0 AS varchar) + CAST(OrdersId AS varchar) AS orderkey
             FROM    dbo.OrderByProductsView
             UNION
             SELECT 0 AS OrdersId, DonationId, ProjectId, Total, Total as TotalInILS, TotalInUSD, TotalInEUR , DateCreated, 'he' AS OrderLaguage, BillingFirstName, BillingLastName, AnonymousUser, UserSource, AnonymousUser AS AnonymousUserName, CAST(BillingFirstName + ' ' + BillingLastName AS nvarchar) AS UserFullName, 
                          ISNULL(recruiterid, 0) AS RecruiterId, CAST(ProjectId AS varchar) + CAST(DonationId AS varchar) + CAST(0 AS varchar) AS orderkey
             FROM   dbo.NadarimDonations) AS O LEFT OUTER JOIN
             dbo.Products AS P ON O.ProjectId = P.productsid

GO
/****** Object:  View [dbo].[GoogleProjectFeedView]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO




CREATE VIEW [dbo].[GoogleProjectFeedView]
AS
SELECT        productsid, Name, Hide, ProjectNameForInvoice_fr, ProjectNameForInvoice_en, 
              ProjectNameForInvoice, DonationLink, DonationLink_en,
              DonationLink_fr,
			  Hide_fr, Hide_en, ProjectNumber, 
			  EndDate, Name_en, Name_fr,
			  ISNULL(DefaultDonationsSum, 0) as Price,
			  ISNULL(DefaultDonationsSum_en, 0) as Price_en, 
              ISNULL(DefaultDonationsSum_fr, 0) as Price_fr, 
			  ISNULL(Pic, 'logo.png') as Pic, 
			  ISNULL(Pic_fr, ISNULL(Pic, 'logo_fr.png')) as Pic_fr, 
			  ISNULL(Pic_en, ISNULL(Pic, 'kupat-en1.png')) as Pic_en, 
			  ISNULL(ProjectNameForInvoice, Name) as Title,
			  ISNULL(ProjectNameForInvoice_en, Name_en) as Title_en,
			  ISNULL(ProjectNameForInvoice_fr, Name_fr) as Title_fr, 
			  'https://www.kupat.org.il/project/' + cast(productsid AS varchar) as Link,
			  'https://www.kupat.org/project/' + cast(productsid AS varchar) as Link_en,
			  'https://www.koupathair.com/project/' + cast(productsid AS varchar) as Link_fr,
			  'in stock' as availability
FROM            dbo.Products

GO
/****** Object:  View [dbo].[GoogleProjectFeedView_he]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

create VIEW [dbo].[GoogleProjectFeedView_he]
AS
SELECT        *
FROM            [dbo].[GoogleProjectFeedView]
where ISNULL(hide, 0) <> 1

GO
/****** Object:  Table [dbo].[RecruitersGroups]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[RecruitersGroups](
	[ID] [int] IDENTITY(1,200000) NOT NULL,
	[Name] [nvarchar](50) NULL,
	[ProjectId] [int] NULL,
	[DonationTarget] [int] NULL,
 CONSTRAINT [PK_RecruitersGroups] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  View [dbo].[ProductStockView]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
Create   VIEW [dbo].[ProductStockView]
AS

SELECT
[ProductStockId]
      ,[productsid]
	  ,pr.ProjectNumber
      ,ps.[Name]
      ,ps.[Hide]
      ,ps.[Name_en]
      ,ps.[Name_fr]
      ,ps.[Hide_en]
      ,ps.[Hide_fr]
      ,ps.[Param]
      ,ps.[Price]
      ,ps.[Price_en]
      ,ps.[Price_fr]
      ,[GroupId]
	  ,rg.[Name] as GroupName
  FROM [dbo].[ProductStock] ps
  left join RecruitersGroups rg
  on rg.ID = ps.GroupId
  left join Products pr
  on ps.ProductId = pr.productsid or (ps.ProductId is null and pr.productsid = rg.ProjectId)
 
GO
/****** Object:  View [dbo].[GoogleProjectFeedView_en]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

create VIEW [dbo].[GoogleProjectFeedView_en]
AS
SELECT        *
FROM            [dbo].[GoogleProjectFeedView]
where ISNULL(Hide_en, 0) <> 1

GO
/****** Object:  View [dbo].[GoogleProjectFeedView_fr]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

create VIEW [dbo].[GoogleProjectFeedView_fr]
AS
SELECT        *
FROM            [dbo].[GoogleProjectFeedView]
where ISNULL(Hide_fr, 0) <> 1

GO
/****** Object:  UserDefinedFunction [dbo].[getLastUserOrdersGroupedByEmail]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
-- =============================================
-- Author:		<Author,,Name>
-- Create date: <Create Date,,>
-- Description:	<Description,,>
-- =============================================
CREATE FUNCTION [dbo].[getLastUserOrdersGroupedByEmail]
(
	@list_size int,
	@from_date datetime,
	@till_date datetime	
	)
RETURNS TABLE 
AS
RETURN 
(
	-- Add the SELECT statement with parameter references here
	SELECT * FROM dbo.Orders D
	CROSS APPLY 
	   ( 
			select Email as UserEmail, OrderId from 
			(SELECT TOP (@list_size) Email, MAX(OrdersId) AS OrderId
			FROM  dbo.Orders 
			where DateCreated >= @from_date AND DateCreated <= @till_date
			GROUP BY Email
			order by OrderId desc
			) E
			WHERE E.OrderId = D.OrdersId
		) A 
	--order by D.OrdersId desc
)

GO
/****** Object:  Table [dbo].[PrayerNames]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[PrayerNames](
	[PrayerNamesId] [int] IDENTITY(1,1) NOT NULL,
	[FirstName] [nvarchar](200) NULL,
	[LastName] [nvarchar](200) NULL,
	[Comment] [nvarchar](max) NULL,
	[OrderId] [int] NULL,
	[DateCreated] [datetime] NULL,
	[Gender] [int] NULL,
	[PrayerId] [int] NULL,
	[OrderLaguage] [varchar](50) NULL,
	[ProjectId] [int] NULL,
 CONSTRAINT [PK_PrayerNames] PRIMARY KEY CLUSTERED 
(
	[PrayerNamesId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  View [dbo].[OrderedPrayerNamesByProjectView]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE VIEW [dbo].[OrderedPrayerNamesByProjectView]
AS
SELECT        dbo.Products.Name AS PrayerTitle, dbo.PrayerNames.FirstName, dbo.PrayerNames.LastName, dbo.PrayerNames.Comment, dbo.PrayerNames.DateCreated, (CASE dbo.PrayerNames.Gender WHEN 0 THEN '׳‘׳' ELSE '׳‘׳×' END) 
                         AS Gender, dbo.PrayerNames.OrderLaguage, dbo.PrayerNames.PrayerNamesId, dbo.Orders.ChargeStatus, dbo.PrayerNames.OrderId
FROM            dbo.PrayerNames INNER JOIN
                         dbo.Products ON dbo.PrayerNames.ProjectId = dbo.Products.productsid INNER JOIN
                         dbo.Orders ON dbo.PrayerNames.OrderId = dbo.Orders.OrdersId
WHERE        (dbo.Orders.ChargeStatus = 'orderfinished')

GO
/****** Object:  View [dbo].[PrayerNamesView]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO



CREATE VIEW [dbo].[PrayerNamesView]
AS
	SELECT dbo.Prayers.Name AS PrayerTitle, dbo.PrayerNames.FirstName, dbo.PrayerNames.LastName, dbo.PrayerNames.Comment, 
		dbo.PrayerNames.DateCreated, (CASE dbo.PrayerNames.Gender WHEN 0 THEN '׳‘׳' ELSE '׳‘׳×' END) AS Gender, 
        (CASE WHEN dbo.Orders.DonationType = 'FixedDonation' THEN
		(CASE WHEN dbo.Orders.Payments = 1000 THEN isnull(dbo.Orders.Total, 0) * 30 ELSE
		isnull(dbo.Orders.Payments, 1) * dbo.Orders.Total END) ELSE dbo.Orders.Total END) AS TotalExtended, 
		dbo.Orders.OrderLaguage, dbo.PrayerNames.PrayerNamesId, dbo.PrayerNames.ProjectId, dbo.Products.Name as ProjectName,
		ISNULL(dbo.Orders.ChargeStatus, '') AS ChargeStatus, dbo.PrayerNames.OrderId, dbo.Orders.Email, dbo.Products.ProjectNumber, dbo.Orders.UserComments
	FROM dbo.PrayerNames 
		INNER JOIN
		dbo.Orders ON dbo.Orders.OrdersId = dbo.PrayerNames.OrderId
		left outer JOIN
		dbo.Prayers ON dbo.PrayerNames.PrayerId = dbo.Prayers.PrayersId		
		left outer JOIN
		dbo.Products ON dbo.PrayerNames.ProjectId = dbo.Products.productsid
	WHERE ChargeStatus = 'orderfinished'

GO
/****** Object:  View [dbo].[PrayerNamesViewOld]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE VIEW [dbo].[PrayerNamesViewOld]
AS
SELECT        dbo.Prayers.Name AS PrayerTitle, dbo.PrayerNames.FirstName, dbo.PrayerNames.LastName, dbo.PrayerNames.Comment, dbo.PrayerNames.DateCreated, (CASE dbo.PrayerNames.Gender WHEN 0 THEN '׳‘׳' ELSE '׳‘׳×' END) 
                         AS Gender, dbo.PrayerNames.OrderLaguage, dbo.PrayerNames.PrayerNamesId, ISNULL
                             ((SELECT        TOP (1) ChargeStatus
                                 FROM            dbo.Orders
                                 WHERE        (OrdersId = dbo.PrayerNames.OrderId)), '') AS Expr1, dbo.PrayerNames.OrderId
FROM            dbo.PrayerNames INNER JOIN
                         dbo.Prayers ON dbo.PrayerNames.PrayerId = dbo.Prayers.PrayersId
WHERE        (ISNULL
                             ((SELECT        TOP (1) ChargeStatus
                                 FROM            dbo.Orders AS Orders_1
                                 WHERE        (OrdersId = dbo.PrayerNames.OrderId)), '') = 'orderfinished')

GO
/****** Object:  View [dbo].[ProjectPrayerNamesView]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE VIEW [dbo].[ProjectPrayerNamesView]
AS
SELECT        dbo.Products.Name AS PrayerTitle, dbo.PrayerNames.FirstName, dbo.PrayerNames.LastName, dbo.PrayerNames.Comment, dbo.PrayerNames.DateCreated, (CASE dbo.PrayerNames.Gender WHEN 0 THEN '׳‘׳' ELSE '׳‘׳×' END) 
                         AS Gender, dbo.PrayerNames.OrderLaguage, dbo.PrayerNames.PrayerNamesId, ISNULL
                             ((SELECT        TOP (1) ChargeStatus
                                 FROM            dbo.Orders
                                 WHERE        (OrdersId = dbo.PrayerNames.OrderId)), '') AS Expr1, dbo.PrayerNames.OrderId
FROM            dbo.PrayerNames INNER JOIN
                         dbo.Products ON dbo.PrayerNames.ProjectId = dbo.Products.productsid
WHERE        (ISNULL
                             ((SELECT        TOP (1) ChargeStatus
                                 FROM            dbo.Orders AS Orders_1
                                 WHERE        (OrdersId = dbo.PrayerNames.OrderId)), '') = 'orderfinished')

GO
/****** Object:  View [dbo].[RecruitersSourcesVies]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE VIEW [dbo].[RecruitersSourcesVies]
AS
SELECT        'recparam' + CAST(ProductStockId AS nvarchar) AS RecruitersSource
FROM            dbo.ProductStock

GO
/****** Object:  View [dbo].[ShortOrdersViewHe]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE VIEW [dbo].[ShortOrdersViewHe]
AS
SELECT O.*, V.* from ( --, V1.*, V2.* 
SELECT   OrdersId, UserId, BillingFirstName, BillingLastName, Phone, dbo.Orders.DateCreated, 
                         (CASE WHEN DonationType = 'FixedDonation' THEN (CASE WHEN Payments = 1000 THEN isnull(Total, 0) * 30 ELSE isnull(Payments, 1) * Total END) ELSE Total END) AS TotalExtended,
						 Total, PaymentMethod, DonationType, Currency, InternalDealNumber, UserSource, OrderLaguage, ChargeStatus, Payments, FirstPayment, 
						 dbo.Orders.ProjectNumber, AsakimInvoiceID, ProjectId, PrayerId, RecruiterId, DealNumberForExtractCardDetails,ClearingProvider, TerminalNumber 
FROM            dbo.Orders) O
outer apply (select ISNULL(Name, '') AS prjName from dbo.Products P where P.productsid = O.ProjectId) V
--outer apply (select ISNULL(Name, '') AS prayerName from dbo.Prayers Pr where Pr.PrayersId = O.PrayerId) V1
--outer apply (select ISNULL(Name, '') AS RecruiterName from dbo.ProductStock Ps where Ps.ProductStockId = O.RecruiterId) V2
WHERE        (OrderLaguage = 'he') and PaymentMethod <> 'NedarimPlus'

GO
/****** Object:  View [dbo].[OrdersViewNedarim]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

Create view [dbo].[OrdersViewNedarim]
AS
SELECT        O.*, V.*, V1.*, V2.*, V3.*
FROM            (SELECT        OrdersId, UserId, BillingFirstName, BillingLastName, BillingStreet, BillingCity, BillingZip, BillingCountry, Phone, dbo.Orders.DateCreated, 
                                                    (CASE WHEN DonationType = 'FixedDonation' THEN (CASE WHEN Payments = 1000 THEN isnull(Total, 0) * 30 ELSE isnull(Payments, 1) * Total END) ELSE Total END) AS TotalExtended, Total, PaymentMethod, 
                                                    DonationType, Currency, InternalDealNumber, UserSource, AnonymousUser, OrderLaguage, AdminComments, UserComments, ChargeStatus, 
                                                    ChargeErrorDesc, Payments, FirstPayment, Email, dbo.Orders.ProjectNumber, ProjectId, PrayerId, 
                                                    RecruiterId, CertificateFullName, CertificateStreet, CertificateCity, CertificateCountry
                          /*ISNULL(dbo.Products.Name, '') AS prjName,  ISNULL(dbo.Prayers.Name, '') AS prayerName, */ FROM dbo.Orders) O OUTER apply
                             (SELECT        TOP 1 ISNULL(Name, '') AS prjName, Certificate
                               FROM            dbo.Products P
                               WHERE        P.productsid = O.ProjectId) V OUTER apply
                             (SELECT        TOP 1 ISNULL(Name, '') AS prayerName
                               FROM            dbo.Prayers Pr
                               WHERE        Pr.PrayersId = O.PrayerId) V1 OUTER apply
                             (SELECT        TOP 1 ISNULL(Name, '') AS RecruiterName
                               FROM            dbo.ProductStock Ps
                               WHERE        Ps.ProductStockId = O.RecruiterId) V2 OUTER apply
                             (SELECT        TOP 1 ISNULL(ParentSource, '') AS ParentSourceName
                               FROM            dbo.SourcesView Ps
                               WHERE        Ps.Source = O.UserSource) V3
WHERE        PaymentMethod = 'NedarimPlus'
GO
/****** Object:  View [dbo].[OrdersTotalsViewShort]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE VIEW [dbo].[OrdersTotalsViewShort]
AS
SELECT        dbo.Orders.OrdersId,  dbo.Orders.StatusId,
						 ISNULL(TotalInILS,0)TotalInILS, ISNULL(TotalInUSD,0)TotalInUSD, ISNULL(TotalInEUR,0)TotalInEUR,
						 dbo.Orders.Total,   dbo.Orders.DateCreated,  dbo.Orders.ChargeStatus, 
                         dbo.Orders.OrderLaguage,
						 dbo.Orders.DonationType,
                         dbo.Orders.ProjectId, dbo.Orders.PrayerId,
                         dbo.Orders.isCharged, 
						 RTRIM(LTRIM(ISNULL(dbo.Orders.UserSource, ''))) AS UserSource,
						 -- RTRIM(LTRIM(CASE WHEN dbo.Orders.UserSource IS NULL or dbo.Orders.UserSource LIKE 'recparam%' THEN '' ELSE dbo.Orders.UserSource END)) AS UserSource
						 -- RTRIM(LTRIM(CASE WHEN dbo.Orders.UserSource IS NULL THEN '' ELSE (CASE WHEN dbo.Orders.UserSource LIKE 'recparam%' or dbo.Orders.RecruiterId > 0 THEN 'recruiter' ELSE dbo.Orders.UserSource END)END)) AS UserSource
						 dbo.UserSources.Title AS SourceTitle, ISNULL(dbo.ParentSources.Id, 0) 
                         AS ParentSourceId
						 ,(CASE WHEN dbo.ParentSources.Name IS NULL THEN (CASE WHEN UserSource LIKE 'recparam%' THEN '׳×׳¨׳•׳׳•׳× ׳׳׳’׳™׳™׳¡׳™׳' ELSE (CASE WHEN ISNULL(UserSource,'') = '' THEN '׳׳׳ ׳׳§׳•׳¨' ELSE '׳׳׳ ׳©׳™׳•׳' END) END) 
                         ELSE dbo.ParentSources.Name END) AS ParentSourceName
FROM            dbo.Orders LEFT OUTER JOIN
                         dbo.UserSources ON dbo.Orders.UserSource = dbo.UserSources.Name LEFT OUTER JOIN
                         dbo.ParentSources ON dbo.UserSources.ParentSourcesId = dbo.ParentSources.Id
						 where ISNULL(IsManualDonation,0) != 1
						 and PaymentMethod != 'NedarimPlus' and PaymentMethod != 'Asakim'
						 --and DateCreated>'2023-11-27'
GO
/****** Object:  Table [dbo].[Logs]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Logs](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[Type] [nvarchar](1000) NULL,
	[Keywords] [nvarchar](1000) NULL,
	[Subject] [varchar](max) NULL,
	[Description] [ntext] NULL,
	[DateCreated] [datetime] NULL,
 CONSTRAINT [PK_Logs] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  View [dbo].[LogsForRecaptchaView]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE VIEW [dbo].[LogsForRecaptchaView]
AS
SELECT        ID, Type, Keywords, Subject, Description, DateCreated
FROM            dbo.Logs
WHERE        (Subject IN ('Captcha', 'No Captcha', 'Captcha failed', 'Capctha low score', 'OverflowDonationsFromMainIP', 'OverflowDonationsFromSameIP'))
GO
/****** Object:  UserDefinedFunction [dbo].[SplitStrings_CTE]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

CREATE FUNCTION [dbo].[SplitStrings_CTE]
(
   @List       NVARCHAR(MAX),
   @Delimiter  NVARCHAR(255)
)
RETURNS @Items TABLE (Item NVARCHAR(4000))
WITH SCHEMABINDING
AS
BEGIN
   DECLARE @ll INT = LEN(@List) + 1, @ld INT = LEN(@Delimiter);

   WITH a AS
   (
       SELECT
           [start] = 1,
           [end]   = COALESCE(NULLIF(CHARINDEX(@Delimiter, 
                       @List, 1), 0), @ll),
           [value] = SUBSTRING(@List, 1, 
                     COALESCE(NULLIF(CHARINDEX(@Delimiter, 
                       @List, 1), 0), @ll) - 1)
       UNION ALL
       SELECT
           [start] = CONVERT(INT, [end]) + @ld,
           [end]   = COALESCE(NULLIF(CHARINDEX(@Delimiter, 
                       @List, [end] + @ld), 0), @ll),
           [value] = SUBSTRING(@List, [end] + @ld, 
                     COALESCE(NULLIF(CHARINDEX(@Delimiter, 
                       @List, [end] + @ld), 0), @ll)-[end]-@ld)
       FROM a
       WHERE [end] < @ll ) INSERT @Items SELECT [value] FROM a WHERE LEN([value]) > 0
   OPTION (MAXRECURSION 0);

   RETURN;
END
GO
/****** Object:  Table [dbo].[AsakimDonations]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[AsakimDonations](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[ProjectId] [int] NULL,
	[CardName] [varchar](200) NULL,
	[DocumentReferenceNumber] [nvarchar](20) NULL,
	[ProjectName] [varchar](150) NULL,
	[ProjectNumber] [nvarchar](20) NULL,
	[SalesPerson] [nvarchar](100) NULL,
	[SumPaymentShekel] [float] NULL,
	[SumPaymentCurrency] [float] NULL,
	[DocID] [int] NULL,
	[DocumentPaymentsID] [nvarchar](20) NULL,
	[CreatedByID] [int] NULL,
	[DocPaymentDate] [nvarchar](30) NULL,
	[DocValueDate] [nvarchar](30) NULL,
	[DocRegisterDate] [nvarchar](30) NULL,
	[CardID] [nvarchar](100) NULL,
	[DocumentType] [nvarchar](100) NULL,
	[DocType] [int] NULL,
	[DocumentName] [nvarchar](100) NULL,
	[DocWorkingCompany] [int] NULL,
	[DocumentStatus] [bit] NULL,
	[DocDetail] [nvarchar](500) NULL,
	[SumFromDocumentsShekel] [float] NULL,
	[SumTax] [float] NULL,
	[SumShekelBeforeVat] [float] NULL,
	[CardsBatchEditRowID] [int] NULL,
	[CreatedBy] [nvarchar](100) NULL,
	[DuplicationNumber] [int] NULL,
	[Permanent] [nvarchar](100) NULL,
	[snMenuPlace] [nvarchar](100) NULL,
	[MenuPlace] [nvarchar](100) NULL,
	[SumCloses] [float] NULL,
	[OpenedSum] [float] NULL,
	[CardAdddress] [nvarchar](500) NULL,
	[PhoneMobily] [nvarchar](500) NULL,
	[PhoneHome] [nvarchar](500) NULL,
	[DocRemark] [nvarchar](500) NULL,
	[ShvaActionName] [nvarchar](500) NULL,
	[ShvaResult] [nvarchar](50) NULL,
	[ShvaIntInID] [nvarchar](50) NULL,
	[ShvaRerenceNumber] [nvarchar](50) NULL,
	[PaymentType] [nvarchar](100) NULL,
	[BankNumber] [nvarchar](50) NULL,
	[CreditCardNumber] [nvarchar](50) NULL,
	[SourceDocumentType] [int] NULL,
	[SourceDocument] [int] NULL,
	[ExportDocumentsID] [int] NULL,
	[ExportID] [nvarchar](100) NULL,
	[ExportRegisterDate] [nvarchar](100) NULL,
	[ExportedDocument] [bit] NULL,
	[RecordDate] [datetime] NULL,
	[CountPayments] [int] NULL,
	[SourceType] [varchar](200) NULL,
	[Comments] [varchar](500) NULL,
	[Status] [int] NOT NULL,
	[ArmyIDNumber] [int] NULL,
	[SalesPersonID] [int] NULL,
	[SalesPersonName] [nvarchar](150) NULL,
	[DonationID] [varchar](50) NULL,
	[BillingID] [int] NULL,
	[BillingItemsID] [int] NULL,
 CONSTRAINT [PK_AsakimDonations] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[AspNetRoles]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[AspNetRoles](
	[Id] [nvarchar](128) NOT NULL,
	[Name] [nvarchar](256) NOT NULL,
 CONSTRAINT [PK_dbo.AspNetRoles] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[AspNetUserClaims]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[AspNetUserClaims](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[UserId] [nvarchar](max) NULL,
	[ClaimType] [nvarchar](max) NULL,
	[ClaimValue] [nvarchar](max) NULL,
	[IdentityUser_Id] [nvarchar](128) NULL,
 CONSTRAINT [PK_dbo.AspNetUserClaims] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[AspNetUserLogins]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[AspNetUserLogins](
	[LoginProvider] [nvarchar](128) NOT NULL,
	[ProviderKey] [nvarchar](128) NOT NULL,
	[UserId] [nvarchar](128) NOT NULL,
	[IdentityUser_Id] [nvarchar](128) NULL,
 CONSTRAINT [PK_dbo.AspNetUserLogins] PRIMARY KEY CLUSTERED 
(
	[LoginProvider] ASC,
	[ProviderKey] ASC,
	[UserId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[AspNetUserRoles]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[AspNetUserRoles](
	[UserId] [nvarchar](128) NOT NULL,
	[RoleId] [nvarchar](128) NOT NULL,
	[IdentityUser_Id] [nvarchar](128) NULL,
 CONSTRAINT [PK_dbo.AspNetUserRoles] PRIMARY KEY CLUSTERED 
(
	[UserId] ASC,
	[RoleId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Banners]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Banners](
	[BannersId] [int] IDENTITY(1,1) NOT NULL,
	[Location] [varchar](50) NULL,
	[Type] [varchar](50) NULL,
	[Pic] [varchar](50) NULL,
	[Link] [varchar](500) NULL,
	[Content1] [varchar](max) NULL,
	[Sort] [int] NULL,
	[Hide] [int] NULL,
	[Pic_en] [varchar](50) NULL,
	[Content1_en] [varchar](max) NULL,
	[Link_en] [varchar](500) NULL,
	[Title] [varchar](500) NULL,
	[Title_en] [varchar](500) NULL,
	[Content1_fr] [nvarchar](max) NULL,
	[Title_fr] [nvarchar](500) NULL,
	[Pic_fr] [nvarchar](50) NULL,
	[Link_fr] [nvarchar](500) NULL,
	[Hide_en] [int] NULL,
	[Hide_fr] [int] NULL,
	[MobilePic] [nvarchar](500) NULL,
	[MobileTitle] [nvarchar](500) NULL,
	[MobilePic_en] [nvarchar](500) NULL,
	[MobileTitle_en] [nvarchar](500) NULL,
	[MobilePic_fr] [nvarchar](500) NULL,
	[MobileTitle_fr] [nvarchar](500) NULL,
	[Name] [nvarchar](500) NULL,
	[Name_en] [nvarchar](500) NULL,
	[Name_fr] [nvarchar](500) NULL,
 CONSTRAINT [PK_Banners] PRIMARY KEY CLUSTERED 
(
	[BannersId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Baskets]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Baskets](
	[BasketId] [int] IDENTITY(1,1) NOT NULL,
	[ProductId] [int] NOT NULL,
	[Quantity] [int] NOT NULL,
	[Price] [real] NOT NULL,
	[Pic] [nvarchar](50) NULL,
	[DateCreated] [datetime] NULL,
	[UserId] [int] NULL,
	[UserRef] [varchar](50) NULL,
 CONSTRAINT [PK_dbo.baskets] PRIMARY KEY CLUSTERED 
(
	[BasketId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Branches]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Branches](
	[BranchesId] [int] IDENTITY(1,1) NOT NULL,
	[Country] [nvarchar](50) NULL,
	[Address] [nvarchar](500) NULL,
	[Pic] [varchar](500) NULL,
	[Sort] [int] NULL,
	[Hide] [int] NULL,
	[Title] [nvarchar](500) NULL,
	[Phone] [nvarchar](50) NULL,
	[Hide_en] [int] NULL,
	[Hide_fr] [int] NULL,
	[Country_en] [nvarchar](50) NULL,
	[Address_en] [nvarchar](500) NULL,
	[Title_en] [nvarchar](500) NULL,
	[Phone_en] [nvarchar](50) NULL,
	[Country_fr] [nvarchar](50) NULL,
	[Address_fr] [nvarchar](500) NULL,
	[Title_fr] [nvarchar](500) NULL,
	[Phone_fr] [nvarchar](50) NULL,
 CONSTRAINT [PK_Branches] PRIMARY KEY CLUSTERED 
(
	[BranchesId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Broshures]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Broshures](
	[BroshuresId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [varchar](200) NULL,
	[Name_en] [varchar](200) NULL,
	[Pic] [varchar](200) NULL,
	[Sort] [int] NULL,
	[Hide] [int] NULL,
	[Description] [varchar](2000) NULL,
	[Link] [varchar](500) NULL,
	[Name_fr] [nvarchar](200) NULL,
	[Description_en] [varchar](2000) NULL,
	[Description_fr] [nvarchar](2000) NULL,
	[Hide_en] [int] NULL,
	[Hide_fr] [int] NULL,
 CONSTRAINT [PK_Broshures] PRIMARY KEY CLUSTERED 
(
	[BroshuresId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[CaptchaExclusion]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[CaptchaExclusion](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[IP] [nvarchar](200) NOT NULL,
	[ExclusionReason] [nvarchar](1000) NOT NULL,
	[CreatedAt] [datetime] NOT NULL,
 CONSTRAINT [PK_CaptchaExclusion] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Cats]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Cats](
	[CatsId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [varchar](200) NULL,
	[FatherId] [int] NULL,
	[Sort] [int] NULL,
	[ChildCount] [int] NULL,
	[Description] [varchar](500) NULL,
	[Pic] [varchar](50) NULL,
	[MetaTitle] [varchar](200) NULL,
	[MetaDescription] [varchar](500) NULL,
	[MetaKeywords] [varchar](500) NULL,
	[Hide] [int] NULL,
	[HideFromHeader] [int] NULL,
	[Name_en] [varchar](200) NULL,
	[Description_en] [varchar](500) NULL,
	[Pic_en] [varchar](500) NULL,
	[MetaTitle_en] [varchar](200) NULL,
	[MetaDescription_en] [varchar](500) NULL,
	[MetaKeywords_en] [varchar](500) NULL,
	[Name_fr] [nvarchar](200) NULL,
	[Description_fr] [nvarchar](500) NULL,
	[Pic_fr] [nvarchar](500) NULL,
	[MetaTitle_fr] [nvarchar](200) NULL,
	[MetaDescription_fr] [nvarchar](500) NULL,
	[MetaKeywords_fr] [nvarchar](500) NULL,
	[Hide_en] [int] NULL,
	[Hide_fr] [int] NULL,
 CONSTRAINT [PK_cats] PRIMARY KEY CLUSTERED 
(
	[CatsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ClothingDonations]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ClothingDonations](
	[ClothingDonationsId] [int] IDENTITY(1,1) NOT NULL,
	[DonationDate] [nvarchar](500) NULL,
	[City] [nvarchar](50) NULL,
	[Hide] [int] NULL,
	[Address] [nvarchar](500) NULL,
	[OpenHours] [nvarchar](2000) NULL,
	[MapLink] [nvarchar](2000) NULL,
	[DonationDate_En] [nvarchar](500) NULL,
	[City_En] [nvarchar](50) NULL,
	[Address_En] [nvarchar](500) NULL,
	[OpenHours_En] [nvarchar](2000) NULL,
	[MapLink_En] [nvarchar](2000) NULL,
	[DonationDate_Fr] [nvarchar](500) NULL,
	[City_Fr] [nvarchar](50) NULL,
	[Address_Fr] [nvarchar](500) NULL,
	[OpenHours_Fr] [nvarchar](2000) NULL,
	[MapLink_Fr] [nvarchar](2000) NULL,
	[Hide_en] [int] NULL,
	[Hide_fr] [int] NULL,
 CONSTRAINT [PK_ClothingDonations] PRIMARY KEY CLUSTERED 
(
	[ClothingDonationsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Columns]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Columns](
	[ColumnId] [int] IDENTITY(1,1) NOT NULL,
	[TableId] [int] NULL,
	[Name] [nvarchar](100) NULL,
	[Title] [nvarchar](100) NULL,
	[Type] [nvarchar](100) NULL,
	[MaxLength] [int] NULL,
	[Control] [nvarchar](100) NULL,
	[Params] [nvarchar](100) NULL,
	[Sort] [float] NULL,
	[Panel] [nvarchar](100) NULL,
	[ShowInList] [bit] NULL,
	[ShowInSearch] [bit] NULL,
	[IsMandatory] [bit] NULL,
	[Tab] [nvarchar](50) NULL,
 CONSTRAINT [PK_Columns] PRIMARY KEY CLUSTERED 
(
	[ColumnId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ContactResponses]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ContactResponses](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[ContactId] [int] NULL,
	[Name] [nvarchar](50) NULL,
	[Email] [nvarchar](50) NULL,
	[Phone] [nvarchar](50) NULL,
	[Subject] [nvarchar](500) NULL,
	[Message] [nvarchar](max) NULL,
	[DateCreated] [datetime] NULL,
	[StatusId] [int] NULL,
	[Language] [nvarchar](50) NULL,
	[RepplyToEmail] [nvarchar](50) NULL,
 CONSTRAINT [PK_ContactResponses] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Contacts]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Contacts](
	[ContactsId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](50) NULL,
	[Email] [nvarchar](50) NULL,
	[Phone] [nvarchar](50) NULL,
	[Subject] [nvarchar](200) NULL,
	[Message] [nvarchar](500) NULL,
	[DateCreated] [datetime] NULL,
	[StatusId] [int] NULL,
	[Language] [nvarchar](50) NULL,
 CONSTRAINT [PK_Contacts] PRIMARY KEY CLUSTERED 
(
	[ContactsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Countries]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Countries](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](500) NULL,
	[Name_en] [nvarchar](500) NULL,
	[Name_fr] [nvarchar](500) NULL,
	[CountryCode] [nvarchar](50) NULL,
	[Currrency] [nvarchar](50) NULL,
 CONSTRAINT [PK_Countries] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Coupons]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Coupons](
	[CouponsId] [int] IDENTITY(1,1) NOT NULL,
	[Code] [varchar](50) NULL,
	[Discount] [int] NULL,
	[Discountop] [varchar](50) NULL,
	[Catid] [int] NULL,
	[Productslist] [varchar](50) NULL,
	[Startdate] [datetime] NULL,
	[Enddate] [datetime] NULL,
	[Isonetime] [int] NULL,
	[Description] [varchar](5000) NULL,
	[Isactive] [int] NULL,
	[Orderid] [int] NULL,
	[Useddate] [datetime] NULL,
	[Type] [int] NULL,
 CONSTRAINT [PK_Coupons] PRIMARY KEY CLUSTERED 
(
	[CouponsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[DiscountCats]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[DiscountCats](
	[DiscountCatsId] [int] IDENTITY(1,1) NOT NULL,
	[Catid] [int] NULL,
	[DiscountId] [int] NULL,
 CONSTRAINT [PK_DiscountCats] PRIMARY KEY CLUSTERED 
(
	[DiscountCatsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Discounts]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Discounts](
	[DiscountsId] [int] IDENTITY(1,1) NOT NULL,
	[CatId] [int] NULL,
	[Name] [nvarchar](50) NULL,
	[Discount] [float] NULL,
	[Pic] [varchar](500) NULL,
	[Type] [varchar](50) NULL,
	[DiscountType] [varchar](50) NULL,
	[x] [int] NULL,
	[y] [int] NULL,
	[Hide] [int] NULL,
	[Products] [varchar](500) NULL,
	[UsersList] [varchar](500) NULL,
	[UpdatePrice] [int] NULL,
	[IsUserListAble] [int] NULL,
	[SpecialUsers] [int] NULL,
	[MinItemsCount] [int] NULL,
	[MaxItemsCount] [int] NULL,
	[Name_en] [nvarchar](50) NULL,
 CONSTRAINT [PK_Discounts] PRIMARY KEY CLUSTERED 
(
	[DiscountsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Exclusions]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Exclusions](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[IP] [nvarchar](200) NOT NULL,
	[Description] [nvarchar](1000) NOT NULL,
	[DateCreated] [datetime] NOT NULL,
 CONSTRAINT [PK_Exclusions] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Funds]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Funds](
	[ID] [int] IDENTITY(1,1) NOT NULL,
	[FullName] [nvarchar](200) NULL,
	[Email] [nvarchar](200) NULL,
	[FundName] [nvarchar](200) NULL,
	[FundTarget] [nvarchar](200) NULL,
	[Category] [nvarchar](200) NULL,
	[PictureUpload] [nvarchar](max) NULL,
 CONSTRAINT [PK_Fund] PRIMARY KEY CLUSTERED 
(
	[ID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Galeries]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Galeries](
	[GaleriesId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](2000) NULL,
	[Name_en] [nvarchar](2000) NULL,
	[Pics] [int] NULL,
	[Sort] [int] NULL,
	[Hide] [int] NULL,
	[Name_fr] [nvarchar](2000) NULL,
	[ShowHomePage] [int] NULL,
	[Hide_en] [int] NULL,
	[Hide_fr] [int] NULL,
 CONSTRAINT [PK_Galeries] PRIMARY KEY CLUSTERED 
(
	[GaleriesId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[GaleryPics]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[GaleryPics](
	[GaleryPicsId] [int] IDENTITY(1,1) NOT NULL,
	[Pic] [varchar](500) NULL,
	[Name] [nvarchar](2000) NULL,
	[Name_en] [nvarchar](2000) NULL,
	[GaleryId] [int] NULL,
	[Name_fr] [nvarchar](2000) NULL,
	[ShowHomePage] [int] NULL,
	[ID]  AS ([GaleryPicsId]),
 CONSTRAINT [PK_GaleryPics] PRIMARY KEY CLUSTERED 
(
	[GaleryPicsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[logs2]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[logs2](
	[logsid] [int] IDENTITY(1,1) NOT NULL,
	[type] [varchar](50) NULL,
	[entry] [varchar](1000) NULL,
	[insertdate] [datetime] NULL,
	[ip] [varchar](50) NULL,
 CONSTRAINT [PK_logs2] PRIMARY KEY CLUSTERED 
(
	[logsid] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[MailTemplates]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[MailTemplates](
	[MailTemplatesId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [varchar](50) NULL,
	[Subject] [varchar](500) NULL,
	[Content1] [text] NULL,
	[Subject_en] [varchar](500) NULL,
	[Content1_en] [text] NULL,
	[Subject_fr] [nvarchar](500) NULL,
	[Content1_fr] [ntext] NULL,
	[ReplyTo] [nvarchar](500) NULL,
	[BCCMails] [nvarchar](500) NULL,
	[BCCMails_en] [nvarchar](500) NULL,
	[BCCMails_fr] [nvarchar](500) NULL,
	[FromMail] [nvarchar](500) NULL,
	[FromMail_en] [nvarchar](500) NULL,
	[FromMail_fr] [nvarchar](500) NULL,
	[ToMail] [nvarchar](500) NULL,
	[ToMail_en] [nvarchar](500) NULL,
	[ToMail_fr] [nvarchar](500) NULL,
	[FromName] [nvarchar](500) NULL,
	[FromName_en] [nvarchar](500) NULL,
	[FromName_fr] [nvarchar](500) NULL,
 CONSTRAINT [PK_MailTemplates] PRIMARY KEY CLUSTERED 
(
	[MailTemplatesId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[NadarimDonationsTest]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[NadarimDonationsTest](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[ProjectId] [int] NULL,
	[Total] [float] NULL,
	[DateCreated] [datetime] NULL,
	[BillingFirstName] [nvarchar](500) NULL,
	[BillingLastName] [nvarchar](500) NULL,
	[AnonymousUser] [bit] NULL,
	[UserSource] [nvarchar](50) NULL,
	[AnonymousUserName] [bit] NULL,
	[UserFullName] [nvarchar](500) NULL,
	[DonationId] [int] NULL,
	[OrderLaguage] [nvarchar](50) NULL,
 CONSTRAINT [PK_NadarimDonationsTest] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[NadarimTotals]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[NadarimTotals](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[ProjectId] [int] NOT NULL,
	[ProjectTitle] [nvarchar](2000) NULL,
	[Total] [float] NULL,
	[Target] [float] NULL,
	[DonatorsCount] [int] NULL,
 CONSTRAINT [PK_NadarimTotals] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[News]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[News](
	[NewsId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [varchar](500) NULL,
	[Content1] [text] NULL,
	[Hide] [int] NULL,
	[Sort] [int] NULL,
	[MetaTitle] [varchar](200) NULL,
	[MetaDescription] [varchar](500) NULL,
	[MetaKeywords] [varchar](500) NULL,
	[Name_en] [varchar](500) NULL,
	[Content1_en] [text] NULL,
	[MetaDescription_en] [varchar](500) NULL,
	[MetaKeywords_en] [varchar](500) NULL,
	[Title] [varchar](200) NULL,
	[Title_en] [varchar](200) NULL,
	[Pic] [varchar](500) NULL,
	[ShortDescription] [nvarchar](max) NULL,
	[ShortDescription_en] [nvarchar](max) NULL,
	[Name_fr] [nvarchar](500) NULL,
	[Content1_fr] [text] NULL,
	[MetaDescription_fr] [nvarchar](500) NULL,
	[MetaKeywords_fr] [nvarchar](500) NULL,
	[Title_fr] [nvarchar](200) NULL,
	[ShortDescription_fr] [nvarchar](max) NULL,
	[Link] [nvarchar](500) NULL,
	[LinkText] [nvarchar](500) NULL,
	[Hide_en] [int] NULL,
	[Hide_fr] [int] NULL,
	[LinkText_en] [nvarchar](500) NULL,
	[LinkText_fr] [nvarchar](500) NULL,
	[Link_en] [nvarchar](500) NULL,
	[Link_fr] [nvarchar](500) NULL,
	[Pic_en] [nvarchar](50) NULL,
	[Pic_fr] [nvarchar](50) NULL,
 CONSTRAINT [PK_News] PRIMARY KEY CLUSTERED 
(
	[NewsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[News2]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[News2](
	[NewsId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [varchar](500) NULL,
	[Content1] [nvarchar](4000) NULL,
	[Hide] [int] NULL,
	[Sort] [int] NULL,
	[MetaTitle] [varchar](200) NULL,
	[MetaDescription] [varchar](500) NULL,
	[MetaKeywords] [varchar](500) NULL,
	[Name_en] [varchar](500) NULL,
	[Content1_en] [text] NULL,
	[MetaDescription_en] [varchar](500) NULL,
	[MetaKeywords_en] [varchar](500) NULL,
	[Title] [varchar](200) NULL,
	[Title_en] [varchar](200) NULL,
	[Pic] [varchar](500) NULL,
	[ShortDescription] [nvarchar](max) NULL,
	[ShortDescription_en] [nvarchar](max) NULL,
	[Name_fr] [nvarchar](500) NULL,
	[Content1_fr] [text] NULL,
	[MetaDescription_fr] [nvarchar](500) NULL,
	[MetaKeywords_fr] [nvarchar](500) NULL,
	[Title_fr] [nvarchar](200) NULL,
	[ShortDescription_fr] [nvarchar](max) NULL,
	[Link] [nvarchar](500) NULL,
	[LinkText] [nvarchar](500) NULL,
	[Hide_en] [int] NULL,
	[Hide_fr] [int] NULL,
	[LinkText_en] [nvarchar](500) NULL,
	[LinkText_fr] [nvarchar](500) NULL,
	[Link_en] [nvarchar](500) NULL,
	[Link_fr] [nvarchar](500) NULL,
	[Pic_en] [nvarchar](50) NULL,
	[Pic_fr] [nvarchar](50) NULL,
 CONSTRAINT [PK_News2] PRIMARY KEY CLUSTERED 
(
	[NewsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Newsletters]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Newsletters](
	[NewslettersId] [int] IDENTITY(1,1) NOT NULL,
	[Email] [varchar](50) NULL,
	[DateCreated] [datetime] NULL,
	[Name] [nvarchar](500) NULL,
 CONSTRAINT [PK_Newsletters] PRIMARY KEY CLUSTERED 
(
	[NewslettersId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[OrderProducts]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[OrderProducts](
	[OrderProductsId] [int] IDENTITY(1,1) NOT NULL,
	[OrderId] [int] NULL,
	[UserId] [int] NULL,
	[ProductId] [int] NULL,
	[Quantity] [int] NULL,
	[Price] [float] NULL,
	[Pic] [nvarchar](50) NULL,
	[DateCreated] [datetime] NULL,
	[Name] [nvarchar](max) NULL,
	[CatalogNo] [nvarchar](50) NULL,
	[DonationDescription] [nvarchar](500) NULL,
 CONSTRAINT [PK_OrderProducts] PRIMARY KEY CLUSTERED 
(
	[OrderProductsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Pages]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Pages](
	[PagesId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](500) NULL,
	[FatherId] [int] NULL,
	[Url] [varchar](200) NULL,
	[MenuName] [nvarchar](500) NULL,
	[Link] [nvarchar](500) NULL,
	[Content1] [text] NULL,
	[ChildCount] [int] NULL,
	[Hide] [int] NULL,
	[Sort] [int] NULL,
	[MetaTitle] [nvarchar](500) NULL,
	[MetaDescription] [nvarchar](500) NULL,
	[MetaKeywords] [nvarchar](500) NULL,
	[Name_en] [nvarchar](500) NULL,
	[MenuName_en] [nvarchar](500) NULL,
	[Content1_en] [text] NULL,
	[MetaTitle_en] [nvarchar](500) NULL,
	[MetaDescription_en] [nvarchar](500) NULL,
	[MetaKeywords_en] [nvarchar](500) NULL,
	[ShowInHeader] [int] NULL,
	[Title] [nvarchar](500) NULL,
	[ShowInFooter] [int] NULL,
	[Name_fr] [nvarchar](500) NULL,
	[MenuName_fr] [nvarchar](500) NULL,
	[Content1_fr] [text] NULL,
	[MetaTitle_fr] [nvarchar](500) NULL,
	[MetaDescription_fr] [nvarchar](500) NULL,
	[MetaKeywords_fr] [nvarchar](500) NULL,
	[Title_en] [nvarchar](500) NULL,
	[Title_fr] [nvarchar](500) NULL,
	[Hide_en] [int] NULL,
	[Hide_fr] [int] NULL,
 CONSTRAINT [PK_Pages] PRIMARY KEY CLUSTERED 
(
	[PagesId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ParamDefinitionCats]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ParamDefinitionCats](
	[ParamDefinitionCatsId] [int] IDENTITY(1,1) NOT NULL,
	[ParamDefinitionId] [int] NULL,
	[CatId] [int] NULL,
 CONSTRAINT [PK_ParamDefinitionCats] PRIMARY KEY CLUSTERED 
(
	[ParamDefinitionCatsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ParamDefinitions]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ParamDefinitions](
	[ParamDefinitionsId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [varchar](100) NULL,
	[Catid] [int] NULL,
	[ComponentName] [varchar](50) NULL,
	[ControlParams] [varchar](500) NULL,
	[SortParams] [int] NULL,
	[HideParams] [int] NULL,
	[ParamOptions] [int] NULL,
	[ShowAllCats] [int] NULL,
	[GroupId] [int] NULL,
	[HideFilter] [int] NULL,
	[SortFilter] [int] NULL,
	[Name_en] [varchar](100) NULL,
 CONSTRAINT [PK_ParamDefinitions] PRIMARY KEY CLUSTERED 
(
	[ParamDefinitionsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ParamsValues]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ParamsValues](
	[ParamsValuesId] [int] IDENTITY(1,1) NOT NULL,
	[ProductId] [int] NULL,
	[CatId] [int] NULL,
	[ParamDefinitionId] [int] NULL,
	[Value] [varchar](500) NULL,
	[Value_en] [varchar](500) NULL,
 CONSTRAINT [PK_ParamsValues] PRIMARY KEY CLUSTERED 
(
	[ParamsValuesId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[PaymentMethods]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[PaymentMethods](
	[PaymentMethodsId] [int] IDENTITY(1,1) NOT NULL,
	[Type] [varchar](50) NULL,
	[Description] [varchar](200) NULL,
	[Hide] [int] NULL,
	[Sort] [int] NULL,
	[Parameters] [nvarchar](max) NULL,
	[Description_en] [varchar](200) NULL,
	[Description_fr] [varchar](200) NULL,
	[Logo] [nvarchar](200) NULL,
	[MainType] [nvarchar](50) NULL,
 CONSTRAINT [PK_PaymentMethods] PRIMARY KEY CLUSTERED 
(
	[PaymentMethodsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ProductCats]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProductCats](
	[ProductCatsId] [int] IDENTITY(1,1) NOT NULL,
	[CatId] [int] NULL,
	[ProductId] [int] NULL,
 CONSTRAINT [PK_ProductCats] PRIMARY KEY CLUSTERED 
(
	[ProductCatsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ProductGroup]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProductGroup](
	[ProductGroupId] [int] IDENTITY(1,1) NOT NULL,
	[ParentProductId] [int] NULL,
	[SubProductId] [int] NULL,
 CONSTRAINT [PK_ProductGroup] PRIMARY KEY CLUSTERED 
(
	[ProductGroupId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ProductOptions]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProductOptions](
	[ProductOptionsId] [int] IDENTITY(1,1) NOT NULL,
	[ProductStockId] [int] NULL,
	[OptionType] [int] NULL,
	[Value] [varchar](200) NULL,
	[Pic] [varchar](50) NULL,
 CONSTRAINT [PK_ProductOptions] PRIMARY KEY CLUSTERED 
(
	[ProductOptionsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ProductOptionTypes]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProductOptionTypes](
	[ProductOptionTypesId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [varchar](50) NULL,
 CONSTRAINT [PK_ProductOptionTypes] PRIMARY KEY CLUSTERED 
(
	[ProductOptionTypesId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ProductPics]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProductPics](
	[ProductPicsId] [int] IDENTITY(1,1) NOT NULL,
	[pic] [nvarchar](500) NULL,
	[productid] [int] NULL,
	[hide] [int] NULL,
	[pic_en] [nvarchar](500) NULL,
	[pic_fr] [nvarchar](500) NULL,
 CONSTRAINT [PK_ProductPics] PRIMARY KEY CLUSTERED 
(
	[ProductPicsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ProductTag]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProductTag](
	[ProductTagId] [int] IDENTITY(1,1) NOT NULL,
	[ProductId] [int] NULL,
	[TagId] [int] NULL,
 CONSTRAINT [PK_ProductTag] PRIMARY KEY CLUSTERED 
(
	[ProductTagId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ProjectUpdates]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ProjectUpdates](
	[ProjectUpdatesId] [int] IDENTITY(1,1) NOT NULL,
	[ProductId] [int] NULL,
	[Description] [nvarchar](max) NULL,
	[DateCreated] [date] NULL,
	[Title] [nvarchar](500) NULL,
	[Title_en] [nvarchar](500) NULL,
	[Title_fr] [nvarchar](500) NULL,
	[Description_en] [nvarchar](max) NULL,
	[Description_fr] [nvarchar](max) NULL,
 CONSTRAINT [PK_ProjectUpdates] PRIMARY KEY CLUSTERED 
(
	[ProjectUpdatesId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[RabiRequests]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[RabiRequests](
	[RabiRequestsId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [varchar](50) NULL,
	[Email] [varchar](50) NULL,
	[Phone] [varchar](50) NULL,
	[Subject] [varchar](200) NULL,
	[Message] [varchar](500) NULL,
	[DateCreated] [datetime] NULL,
	[StatusId] [int] NULL,
	[Language] [nvarchar](50) NOT NULL,
 CONSTRAINT [PK_RabiRequests] PRIMARY KEY CLUSTERED 
(
	[RabiRequestsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Redirects]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Redirects](
	[RedirectsId] [int] IDENTITY(1,1) NOT NULL,
	[FromUrl] [varchar](100) NULL,
	[ToUrl] [varchar](100) NULL,
 CONSTRAINT [PK_Redirects] PRIMARY KEY CLUSTERED 
(
	[RedirectsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Rules]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Rules](
	[rulesid] [int] IDENTITY(1,1) NOT NULL,
	[userid] [int] NULL,
	[type] [varchar](50) NULL,
	[name] [varchar](200) NULL,
	[value] [varchar](200) NULL,
 CONSTRAINT [PK_Rules] PRIMARY KEY CLUSTERED 
(
	[rulesid] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Salvations]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Salvations](
	[SalvationsId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](500) NULL,
	[Content1] [text] NULL,
	[Hide] [int] NULL,
	[Sort] [int] NULL,
	[MetaTitle] [nvarchar](200) NULL,
	[MetaDescription] [nvarchar](500) NULL,
	[MetaKeywords] [nvarchar](500) NULL,
	[Name_en] [nvarchar](500) NULL,
	[Content1_en] [text] NULL,
	[MetaDescription_en] [nvarchar](500) NULL,
	[MetaKeywords_en] [nvarchar](500) NULL,
	[Title] [nvarchar](200) NULL,
	[Title_en] [nvarchar](200) NULL,
	[Pic] [nvarchar](500) NULL,
	[ShortDescription] [nvarchar](max) NULL,
	[ShortDescription_en] [nvarchar](max) NULL,
	[Name_fr] [nvarchar](500) NULL,
	[Content1_fr] [text] NULL,
	[MetaDescription_fr] [nvarchar](500) NULL,
	[MetaKeywords_fr] [nvarchar](500) NULL,
	[Title_fr] [nvarchar](200) NULL,
	[ShortDescription_fr] [nvarchar](max) NULL,
	[Hide_en] [int] NULL,
	[Hide_fr] [int] NULL,
 CONSTRAINT [PK_Salvations] PRIMARY KEY CLUSTERED 
(
	[SalvationsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Settings]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Settings](
	[settingsid] [int] IDENTITY(1,1) NOT NULL,
	[name] [varchar](200) NULL,
	[title] [varchar](200) NULL,
	[type] [varchar](50) NULL,
	[length] [int] NULL,
	[value] [nvarchar](1000) NULL,
	[sort] [int] NULL,
	[componentname] [varchar](200) NULL,
	[controlparams] [varchar](500) NULL,
	[description] [varchar](100) NULL,
	[tabname] [varchar](50) NULL,
	[isreadonly] [int] NULL,
	[ismandatory] [int] NULL,
 CONSTRAINT [PK_settings] PRIMARY KEY CLUSTERED 
(
	[settingsid] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[ShippingMethods]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[ShippingMethods](
	[ShippingMethodsId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [varchar](50) NULL,
	[Price] [float] NULL,
	[Hide] [int] NULL,
	[Sort] [int] NULL,
	[Name_en] [varchar](50) NULL,
 CONSTRAINT [PK_ShippingMethods] PRIMARY KEY CLUSTERED 
(
	[ShippingMethodsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Statuses]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Statuses](
	[StatusId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](50) NULL,
	[Color] [varchar](50) NULL,
	[Name_en] [nvarchar](50) NULL,
 CONSTRAINT [PK_Status] PRIMARY KEY CLUSTERED 
(
	[StatusId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[tableadmin]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[tableadmin](
	[tableadminid] [int] IDENTITY(1,1) NOT NULL,
	[name] [varchar](50) NULL,
	[itemname] [varchar](50) NULL,
	[navurl] [varchar](2000) NULL,
	[navtitle] [varchar](50) NULL,
	[rowscounter] [int] NULL,
	[section] [varchar](50) NULL,
	[sort] [int] NULL,
	[pageurl] [varchar](500) NULL,
	[updatebuttons] [varchar](1000) NULL,
	[primarykey] [varchar](100) NULL,
	[showexport] [int] NULL,
	[callapi] [nvarchar](200) NULL,
 CONSTRAINT [PK_tableadmin] PRIMARY KEY CLUSTERED 
(
	[tableadminid] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[tableadminfield]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[tableadminfield](
	[tableadminfieldid] [int] IDENTITY(1,1) NOT NULL,
	[tableadminid] [int] NULL,
	[name] [varchar](50) NULL,
	[title] [varchar](50) NULL,
	[type] [varchar](50) NULL,
	[length] [int] NULL,
	[fieldorder] [int] NULL,
	[componentname] [varchar](50) NULL,
	[controlparams] [varchar](500) NULL,
	[ismandatory] [int] NULL,
	[isreadonly] [int] NULL,
	[islocked] [int] NULL,
	[isshowinlist] [int] NULL,
	[linkurl] [varchar](50) NULL,
	[description] [varchar](100) NULL,
	[issearchby] [int] NULL,
	[tabname] [varchar](50) NULL,
	[isunique] [int] NULL,
	[jscode] [varchar](max) NULL,
 CONSTRAINT [PK_tableadminfield] PRIMARY KEY CLUSTERED 
(
	[tableadminfieldid] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Tables]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Tables](
	[TableId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [varchar](200) NULL,
	[ItemName] [nvarchar](200) NULL,
	[Section] [nvarchar](200) NULL,
	[Sort] [float] NULL,
	[PrimaryKey] [varchar](50) NULL,
	[NameColumn] [varchar](50) NULL,
 CONSTRAINT [PK_Tables] PRIMARY KEY CLUSTERED 
(
	[TableId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Tags]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Tags](
	[TagId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [varchar](200) NULL,
 CONSTRAINT [PK_Tags] PRIMARY KEY CLUSTERED 
(
	[TagId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Terminals]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Terminals](
	[TerminalId] [int] IDENTITY(1,1) NOT NULL,
	[TerminalNo] [int] NULL,
	[Name] [varchar](200) NULL,
	[Title] [varchar](200) NULL,
	[UserName] [nvarchar](200) NULL,
	[MosadNum] [nvarchar](7) NULL,
	[ApiValid] [nvarchar](10) NULL,
 CONSTRAINT [PK_Terminals] PRIMARY KEY CLUSTERED 
(
	[TerminalId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Users]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Users](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[FirstName] [nvarchar](50) NULL,
	[LastName] [nvarchar](50) NULL,
	[Email] [nvarchar](max) NULL,
	[EmailConfirmed] [bit] NOT NULL,
	[PasswordHash] [nvarchar](max) NULL,
	[SecurityStamp] [nvarchar](max) NULL,
	[PhoneNumber] [nvarchar](max) NULL,
	[PhoneNumberConfirmed] [bit] NOT NULL,
	[TwoFactorEnabled] [bit] NOT NULL,
	[LockoutEndDateUtc] [datetime] NULL,
	[LockoutEnabled] [bit] NOT NULL,
	[AccessFailedCount] [int] NOT NULL,
	[UserName] [nvarchar](max) NULL,
	[PasswordOld] [nvarchar](max) NULL,
	[DateCreated] [datetime] NULL,
	[Activated] [bit] NULL,
	[UserRole] [bit] NULL,
	[Discriminator] [nvarchar](128) NULL,
	[Fax] [varchar](50) NULL,
	[Company] [nvarchar](50) NULL,
	[UsersId] [int] NULL,
	[IsReceivingNewsletter] [bit] NULL,
	[NotApproved] [int] NULL,
	[Street] [nvarchar](500) NULL,
	[City] [nvarchar](500) NULL,
	[Country] [nvarchar](500) NULL,
	[userorders] [int] NULL,
	[Language] [varchar](50) NOT NULL,
 CONSTRAINT [PK_dbo.users] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Videos]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Videos](
	[VideosId] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](2000) NULL,
	[Name_en] [nvarchar](2000) NULL,
	[Pic] [nvarchar](2000) NULL,
	[Sort] [int] NULL,
	[Hide] [int] NULL,
	[Description] [varchar](2000) NULL,
	[Link] [nvarchar](2000) NULL,
	[Name_fr] [nvarchar](2000) NULL,
	[Description_en] [nvarchar](2000) NULL,
	[Description_fr] [nvarchar](2000) NULL,
	[ShowHomePage] [int] NULL,
	[Hide_en] [int] NULL,
	[Hide_fr] [int] NULL,
	[Link_en] [nvarchar](2000) NULL,
	[Link_fr] [nvarchar](2000) NULL,
	[WistiaId] [nvarchar](200) NULL,
	[WistiaId_en] [nvarchar](200) NULL,
	[WistiaId_fr] [nvarchar](200) NULL,
 CONSTRAINT [PK_Videos] PRIMARY KEY CLUSTERED 
(
	[VideosId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Index [IX_News2]    Script Date: 04/09/2025 16:23:08 ******/
CREATE NONCLUSTERED INDEX [IX_News2] ON [dbo].[News2]
(
	[NewsId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
SET ANSI_PADDING ON
GO
/****** Object:  Index [AsakimIDIndex]    Script Date: 04/09/2025 16:23:08 ******/
CREATE NONCLUSTERED INDEX [AsakimIDIndex] ON [dbo].[Orders]
(
	[AsakimID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
SET ANSI_PADDING ON
GO
/****** Object:  Index [IX_Orders]    Script Date: 04/09/2025 16:23:08 ******/
CREATE NONCLUSTERED INDEX [IX_Orders] ON [dbo].[Orders]
(
	[UserSource] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
/****** Object:  Index [IX_Orders1]    Script Date: 04/09/2025 16:23:08 ******/
CREATE NONCLUSTERED INDEX [IX_Orders1] ON [dbo].[Orders]
(
	[DateCreated] DESC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
SET ANSI_PADDING ON
GO
/****** Object:  Index [IX_UserSources]    Script Date: 04/09/2025 16:23:08 ******/
CREATE NONCLUSTERED INDEX [IX_UserSources] ON [dbo].[UserSources]
(
	[Name] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
GO
ALTER TABLE [dbo].[Orders] ADD  CONSTRAINT [DF_Orders_UserId]  DEFAULT ((0)) FOR [UserId]
GO
ALTER TABLE [dbo].[Orders] ADD  CONSTRAINT [DF_Orders_Total]  DEFAULT ((0)) FOR [Total]
GO
ALTER TABLE [dbo].[Orders] ADD  CONSTRAINT [DF_Orders_Payments]  DEFAULT ((1)) FOR [Payments]
GO
ALTER TABLE [dbo].[Orders] ADD  CONSTRAINT [DF_Orders_ShippingPrice]  DEFAULT ((0)) FOR [ShippingPrice]
GO
ALTER TABLE [dbo].[Orders] ADD  CONSTRAINT [DF_Orders_Tax]  DEFAULT ((0)) FOR [Tax]
GO
ALTER TABLE [dbo].[Orders] ADD  CONSTRAINT [DF_Orders_Currency]  DEFAULT ('׳©ג€׳—') FOR [Currency]
GO
ALTER TABLE [dbo].[Orders] ADD  CONSTRAINT [DF_Orders_RecruiterId]  DEFAULT ((0)) FOR [RecruiterId]
GO
ALTER TABLE [dbo].[Products] ADD  CONSTRAINT [DF_Products_AddDonation]  DEFAULT ((0)) FOR [AddDonation]
GO
ALTER TABLE [dbo].[Products] ADD  CONSTRAINT [DF_Products_AddDonationCount]  DEFAULT ((0)) FOR [AddDonationCount]
GO
ALTER TABLE [dbo].[Products] ADD  CONSTRAINT [DF_Products_Price_en]  DEFAULT ((0)) FOR [Price_en]
GO
ALTER TABLE [dbo].[Products] ADD  CONSTRAINT [DF_Products_Price_en1]  DEFAULT ((0)) FOR [Price_fr]
GO
ALTER TABLE [dbo].[RabiRequests] ADD  CONSTRAINT [DF_RabiRequests_Language]  DEFAULT (N'he') FOR [Language]
GO
ALTER TABLE [dbo].[Users] ADD  CONSTRAINT [DF_Users_Language]  DEFAULT ('unknown') FOR [Language]
GO
ALTER TABLE [dbo].[AspNetUserRoles]  WITH CHECK ADD  CONSTRAINT [FK_dbo.AspNetUserRoles_dbo.AspNetRoles_RoleId] FOREIGN KEY([RoleId])
REFERENCES [dbo].[AspNetRoles] ([Id])
ON DELETE CASCADE
GO
ALTER TABLE [dbo].[AspNetUserRoles] CHECK CONSTRAINT [FK_dbo.AspNetUserRoles_dbo.AspNetRoles_RoleId]
GO
ALTER TABLE [dbo].[ProductGroup]  WITH CHECK ADD  CONSTRAINT [FK_ProductGroup_Products_Parent] FOREIGN KEY([ParentProductId])
REFERENCES [dbo].[Products] ([productsid])
GO
ALTER TABLE [dbo].[ProductGroup] CHECK CONSTRAINT [FK_ProductGroup_Products_Parent]
GO
ALTER TABLE [dbo].[ProductGroup]  WITH CHECK ADD  CONSTRAINT [FK_ProductGroup_Products_SubProduct] FOREIGN KEY([SubProductId])
REFERENCES [dbo].[Products] ([productsid])
GO
ALTER TABLE [dbo].[ProductGroup] CHECK CONSTRAINT [FK_ProductGroup_Products_SubProduct]
GO
ALTER TABLE [dbo].[ProductTag]  WITH CHECK ADD  CONSTRAINT [FK_ProductTag_Products] FOREIGN KEY([ProductId])
REFERENCES [dbo].[Products] ([productsid])
GO
ALTER TABLE [dbo].[ProductTag] CHECK CONSTRAINT [FK_ProductTag_Products]
GO
ALTER TABLE [dbo].[ProductTag]  WITH CHECK ADD  CONSTRAINT [FK_ProductTag_Tags] FOREIGN KEY([TagId])
REFERENCES [dbo].[Tags] ([TagId])
GO
ALTER TABLE [dbo].[ProductTag] CHECK CONSTRAINT [FK_ProductTag_Tags]
GO
/****** Object:  StoredProcedure [dbo].[ExportToCsv]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
-- =============================================
-- Author:		<Author,,Name>
-- Create date: <Create Date,,>
-- Description:	<Description,,>
-- =============================================
CREATE PROCEDURE [dbo].[ExportToCsv]
	@PATH VARCHAR(MAX) = '' -- ׳׳™׳₪׳” ׳׳™׳™׳¦׳¨ ׳׳× ׳”׳“׳•׳—
	, @HEADERS VARCHAR(MAX) = ''-- ׳›׳•׳×׳¨׳•׳× ׳׳•׳₪׳¨׳“׳•׳× ׳‘׳₪׳¡׳™׳§
	, @UNICODE VARCHAR(MAX) = '1255'
	, @SQL_QUERY VARCHAR(MAX) = ''
AS
BEGIN
 
	--todo!! set individually!!!!

    DECLARE @DB_NAME VARCHAR(100) = 'kupatTest' -- ׳©׳ ׳׳¡׳“ ׳”׳ ׳×׳•׳ ׳™׳
	DECLARE @SERVER_NAME VARCHAR(100) = '185.18.204.208' -- for un understood reason in 185.18.204.208 it fail if use the @@SERVERNAME'

	-- SET NOCOUNT ON added to prevent extra result sets from
	-- interfering with SELECT statements.
	SET NOCOUNT ON;

    DECLARE @CMD VARCHAR(8000)
	SET @cmd = CONCAT(
ג€‚ג€‚ג€‚ג€‚ג€‚ג€‚	  'SQLCMD -S ', @SERVER_NAME, ' -Q "SET NOCOUNT ON;',
ג€‚ג€‚ג€‚ג€‚ג€‚	 'SELECT ', @HEADERS,';',
		@SQL_QUERY,
		 '" -d "', @DB_NAME, '" -f o:', @UNICODE,'  -E -s "," -y0 -o "', @PATH, '"')
	EXEC XP_CMDSHELL @cmd
END

GO
/****** Object:  StoredProcedure [dbo].[OrderTotalsBySources]    Script Date: 04/09/2025 16:23:08 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
-- =============================================
-- Author:		<Y.Bo>
-- Create date: <11/12/2023>
-- Description:	<Description,,>
-- =============================================
CREATE PROCEDURE [dbo].[OrderTotalsBySources]
     @start_date datetime =NULL
	 ,@end_date datetime = NULL
	 ,@current_language VARCHAR(100) = NULL--'he-IL'
	 ,@including_fixed_donation_summary bit = 0 
	 
	 ,@Langs varchar(100) = NULL
	 ,@UserSources varchar(max) = NULL
	 ,@IsRegDon bit = 0
	 ,@IsProject bit = 0
	 ,@IsPrayer bit = 0
	 ,@Projects varchar(max) = NULL
	 ,@Tags varchar(max) = NULL
	 ,@Prayers varchar(max) = NULL

	 ,@formatStr varchar(100) = '{0:c0}'
	 --,@changeRateEn	float=1
	 --,@changeRateFr	float=1
	
AS
BEGIN
 
 SELECT 
		[Extent1].[UserSource] AS SourceName,--[UserSource], 
		MAX([Extent1].[SourceTitle]) AS [SourceTitle], 
		MAX([Extent1].[ParentSourceName]) AS [ParentSourceName], 
		COUNT(1) AS [DonatorsNum],
		@current_language AS CurrentLanguage,
		--@changeRateEn AS ChangeRateEn,
		--@changeRateFr AS ChangeRateFr,
		@formatStr AS FormatStr,
		/*SUM(CASE WHEN N'he' = [Extent1].[OrderLaguage] THEN TotalExtended ELSE 0 END) TotalSumHe,
		SUM(CASE WHEN N'en' = [Extent1].[OrderLaguage] THEN TotalExtended ELSE 0 END) TotalSumEn,
		SUM(CASE WHEN N'fr' = [Extent1].[OrderLaguage] THEN TotalExtended ELSE 0 END) TotalSumFr*/
		SUM(TotalInILS) TotalInILS,
		SUM(TotalInUSD) TotalInUSD,
		SUM(TotalInEUR) TotalInEUR
		
		--SUM(CASE WHEN N'he' = [Extent1].[OrderLaguage] THEN (CASE WHEN @including_fixed_donation_summary=1 THEN TotalExtended ELSE Total END) ELSE 0 END) TotalSumHe,
		--SUM(CASE WHEN N'en' = [Extent1].[OrderLaguage] THEN (CASE WHEN @including_fixed_donation_summary=1 THEN TotalExtended ELSE Total END) ELSE 0 END) TotalSumEn,
		--SUM(CASE WHEN N'fr' = [Extent1].[OrderLaguage] THEN (CASE WHEN @including_fixed_donation_summary=1 THEN TotalExtended ELSE Total END) ELSE 0 END) TotalSumFr
		FROM [dbo].[OrdersTotalsViewShort] AS [Extent1]
		WHERE ([Extent1].[isCharged] = 1 OR [Extent1].[ChargeStatus] = N'OrderFinished') And  [Extent1].[ChargeStatus] <> N'ChargePartiallyFailed'
		--׳©׳₪׳•׳×
		AND (@Langs IS NULL Or ([OrderLaguage] IN (SELECT item FROM dbo.SplitStrings_CTE(@Langs, ','))))
		--AND ([OrderLaguage] IN (SELECT value FROM string_split( @Langs, ',')))
		--׳׳§׳•׳¨
		--AND ( EXISTS (SELECT 
--                           1 AS [C1]
--                           FROM  (SELECT 
--                               N'whatsapp' AS [C1]
--                               FROM  ( SELECT 1 AS X ) AS [SingleRowTable4]
--                           UNION ALL
--                               SELECT 
--                               N'emailkupat' AS [C1]
--                               FROM  ( SELECT 1 AS X ) AS [SingleRowTable5]) AS [UnionAll2]
--                           WHERE [UnionAll2].[C1] = [UserSource]))
		And (@including_fixed_donation_summary = 1 or DonationType != 'FixedDonation')
		And (@UserSources IS NULL or UserSource IN (SELECT item FROM dbo.SplitStrings_CTE(@UserSources, ',')))
									
		--׳¡׳•׳’ ׳×׳¨׳•׳׳”
		--AND ((0 = (CASE WHEN ([Extent3].[ProjectId] IS NULL) THEN 0 ELSE [Extent3].[ProjectId] END)) OR ((CASE WHEN ([Extent3].[PrayerId] IS NULL) THEN 0 ELSE [Extent3].[PrayerId] END) > 0))
		AND ((@IsRegDon = 1 And @IsProject=1 And @IsPrayer=1)
		or ((@IsRegDon = 1 And @IsProject=0 And @IsPrayer=0) and ISNULL(ProjectId,0) = 0 OR ISNULL(PrayerId,0) = 0)
		or ((@IsRegDon = 1 And @IsProject=1 And @IsPrayer=0) and ISNULL(ProjectId,0) > 0 OR ISNULL(PrayerId,0) = 0)
		or ((@IsRegDon = 1 And @IsProject=0 And @IsPrayer=1) and ISNULL(ProjectId,0) = 0 OR ISNULL(PrayerId,0) > 0)
		or ((@IsRegDon = 0 And @IsProject=1 And @IsPrayer=1) and ISNULL(ProjectId,0) > 0 OR ISNULL(PrayerId,0) > 0)
		or ((@IsRegDon = 0 And @IsProject=1 And @IsPrayer=0) and ISNULL(ProjectId,0) > 0)
		or ((@IsRegDon = 0 And @IsProject=0 And @IsPrayer=1) and ISNULL(PrayerId,0) > 0))

		--׳§׳¨׳
		--AND (CASE WHEN ([Extent5].[ProjectId] IS NULL) THEN N'' ELSE  CAST( [Extent5].[ProjectId] AS nvarchar(max)) END IN (N'3', N'4')) AND (CASE WHEN ([Extent5].[ProjectId] IS NULL) THEN N'' ELSE  CAST( [Extent5].[ProjectId] AS nvarchar(max)) END IS NOT NULL)
		AND (@Projects IS NULL or ProjectId IN (SELECT item FROM dbo.SplitStrings_CTE(@Projects, ',')))

		--׳×׳’׳™׳×
									
		AND (@Tags IS NULL OR ( EXISTS (SELECT 
			1 AS [C1]
			FROM ( SELECT DISTINCT 
					CAST( [Extent2].[ProductId] AS nvarchar(max)) AS [C1]
				FROM [dbo].[ProductTag] AS [Extent2]
				WHERE [Extent2].[TagId] IN (SELECT item FROM dbo.SplitStrings_CTE(@Tags, ','))
			)  AS [Distinct1]
			WHERE [Distinct1].[C1] = [Extent1].[ProjectId]
		))) 
		--׳×׳₪׳™׳׳”
		--AND (CASE WHEN ([Extent2].[PrayerId] IS NULL) THEN N'' ELSE  CAST( [Extent2].[PrayerId] AS nvarchar(max)) END IN (N'1')) AND (CASE WHEN ([Extent2].[PrayerId] IS NULL) THEN N'' ELSE  CAST( [Extent2].[PrayerId] AS nvarchar(max)) END IS NOT NULL)
		AND (@Prayers IS NULL OR [Extent1].[PrayerId] IN (SELECT item FROM dbo.SplitStrings_CTE(@Prayers, ',')))
		--׳×׳׳¨׳™׳
		AND ([Extent1].[DateCreated] >= @start_date) AND ([Extent1].[DateCreated] <= @end_date)
		GROUP BY [Extent1].[UserSource]

END

--===================================================================================

/****** Object:  View [dbo].[OrderByProductsView]    Script Date: 04/03/2024 15:44:57 ******/
SET ANSI_NULLS ON

GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[27] 4[22] 2[23] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "Products (dbo)"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 290
            End
            DisplayFlags = 280
            TopColumn = 7
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 9
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'GoogleProjectFeedView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'GoogleProjectFeedView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[40] 4[20] 2[20] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "P"
            Begin Extent = 
               Top = 115
               Left = 867
               Bottom = 312
               Right = 1211
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "O"
            Begin Extent = 
               Top = 9
               Left = 57
               Bottom = 206
               Right = 340
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 15
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1000
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'OrderByProductsSiteView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'OrderByProductsSiteView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[20] 4[21] 2[20] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "Orders (dbo)"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 252
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 12
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 2145
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'OrderByProductsView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'OrderByProductsView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[40] 4[20] 2[20] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "PrayerNames (dbo)"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 208
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "Products (dbo)"
            Begin Extent = 
               Top = 156
               Left = 288
               Bottom = 286
               Right = 529
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "Orders (dbo)"
            Begin Extent = 
               Top = 6
               Left = 525
               Bottom = 136
               Right = 771
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 9
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'OrderedPrayerNamesByProjectView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'OrderedPrayerNamesByProjectView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[32] 4[24] 2[25] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "Orders"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 284
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "UserSources"
            Begin Extent = 
               Top = 27
               Left = 523
               Bottom = 157
               Right = 697
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "ParentSources"
            Begin Extent = 
               Top = 27
               Left = 921
               Bottom = 157
               Right = 1091
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 11
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'OrdersTotalsView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'OrdersTotalsView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[40] 4[20] 2[20] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "Orders (dbo)"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 252
            End
            DisplayFlags = 280
            TopColumn = 74
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 9
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'OrdersViewEn'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'OrdersViewEn'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[17] 4[10] 2[18] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "Orders (dbo)"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 252
            End
            DisplayFlags = 280
            TopColumn = 65
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 10
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'OrdersViewFr'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'OrdersViewFr'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[25] 4[11] 2[46] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "Orders (dbo)"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 252
            End
            DisplayFlags = 280
            TopColumn = 77
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 33
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 3945
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'OrdersViewHe'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'OrdersViewHe'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[20] 4[18] 2[23] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "PrayerNames (dbo)"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 208
            End
            DisplayFlags = 280
            TopColumn = 5
         End
         Begin Table = "Prayers (dbo)"
            Begin Extent = 
               Top = 6
               Left = 246
               Bottom = 136
               Right = 416
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 11
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'PrayerNamesViewOld'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'PrayerNamesViewOld'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[40] 4[20] 2[20] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "PrayerNames (dbo)"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 208
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "Products (dbo)"
            Begin Extent = 
               Top = 6
               Left = 246
               Bottom = 136
               Right = 441
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'ProjectPrayerNamesView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'ProjectPrayerNamesView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[40] 4[20] 2[20] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "Orders (dbo)"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 300
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "Products (dbo)"
            Begin Extent = 
               Top = 6
               Left = 338
               Bottom = 136
               Right = 595
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 9
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 12
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'ProjectTotalsEnView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'ProjectTotalsEnView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[40] 4[20] 2[20] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "Orders (dbo)"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 300
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "Products (dbo)"
            Begin Extent = 
               Top = 6
               Left = 338
               Bottom = 136
               Right = 595
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 9
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 12
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'ProjectTotalsFrView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'ProjectTotalsFrView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[41] 4[20] 2[11] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "Orders (dbo)"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 300
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "Products (dbo)"
            Begin Extent = 
               Top = 120
               Left = 402
               Bottom = 250
               Right = 659
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 9
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 12
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'ProjectTotalsHeView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'ProjectTotalsHeView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[41] 4[20] 2[15] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "Products (dbo)"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 279
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "ProjectTotalsHeView (dbo)"
            Begin Extent = 
               Top = 177
               Left = 689
               Bottom = 290
               Right = 859
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "ProjectTotalsEnView (dbo)"
            Begin Extent = 
               Top = 103
               Left = 892
               Bottom = 216
               Right = 1062
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "ProjectTotalsFrView (dbo)"
            Begin Extent = 
               Top = 8
               Left = 1098
               Bottom = 121
               Right = 1268
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "NadarimTotals (dbo)"
            Begin Extent = 
               Top = 186
               Left = 347
               Bottom = 316
               Right = 517
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 10
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin C' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'ProjectTotalsSiteView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane2', @value=N'riteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'ProjectTotalsSiteView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=2 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'ProjectTotalsSiteView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[34] 4[19] 2[21] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "Products (dbo)"
            Begin Extent = 
               Top = 0
               Left = 254
               Bottom = 130
               Right = 495
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "ProjectTotalsHeView (dbo)"
            Begin Extent = 
               Top = 4
               Left = 578
               Bottom = 117
               Right = 748
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "ProjectTotalsEnView (dbo)"
            Begin Extent = 
               Top = 128
               Left = 554
               Bottom = 241
               Right = 724
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "ProjectTotalsFrView (dbo)"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 119
               Right = 239
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 10
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filt' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'ProjectTotalsView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane2', @value=N'er = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'ProjectTotalsView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=2 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'ProjectTotalsView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[41] 4[20] 2[6] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "ProductStock (dbo)"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 208
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
      Begin ColumnWidths = 9
         Width = 284
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
         Width = 1500
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'RecruitersSourcesVies'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'RecruitersSourcesVies'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[40] 4[20] 2[20] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "UserSources"
            Begin Extent = 
               Top = 6
               Left = 38
               Bottom = 136
               Right = 212
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "ParentSources"
            Begin Extent = 
               Top = 6
               Left = 250
               Bottom = 136
               Right = 420
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 900
         Table = 1170
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'SourcesView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=1 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'SourcesView'
GO
USE [master]
GO
ALTER DATABASE [KupatHairDB] SET  READ_WRITE 
GO

