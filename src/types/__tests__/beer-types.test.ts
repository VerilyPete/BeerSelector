import { isBeer, isBeerfinder, isBeerDetails, isCheckInResponse } from '../beer';
import { Beer, Beerfinder, BeerDetails, CheckInResponse } from '../beer';

describe('Beer Type Guards', () => {
  describe('isBeer', () => {
    it('should return true for valid Beer objects', () => {
      const validBeer: Beer = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        brewer: 'Test Brewery'
      };
      
      expect(isBeer(validBeer)).toBe(true);
    });
    
    it('should return false for invalid Beer objects', () => {
      const missingId = {
        brew_name: 'Test Beer',
        brewer: 'Test Brewery'
      };
      
      const missingBrewName = {
        id: 'beer-123',
        brewer: 'Test Brewery'
      };
      
      const wrongTypes = {
        id: 123,
        brew_name: 'Test Beer',
        brewer: 'Test Brewery'
      };
      
      expect(isBeer(missingId)).toBe(false);
      expect(isBeer(missingBrewName)).toBe(false);
      expect(isBeer(wrongTypes)).toBe(false);
      expect(isBeer(null)).toBe(false);
      expect(isBeer(undefined)).toBe(false);
    });
  });
  
  describe('isBeerfinder', () => {
    it('should return true for valid Beerfinder objects', () => {
      const validBeerfinder: Beerfinder = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        brewer: 'Test Brewery',
        tasted_date: '2023-01-01',
        chit_code: 'test-chit-code'
      };
      
      expect(isBeerfinder(validBeerfinder)).toBe(true);
    });
    
    it('should return true for Beer objects with at least one Beerfinder property', () => {
      const beerWithTastedDate: Beerfinder = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        tasted_date: '2023-01-01'
      };
      
      const beerWithRohLap: Beerfinder = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        roh_lap: '1'
      };
      
      const beerWithReviewRatings: Beerfinder = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        review_ratings: '4.5'
      };
      
      const beerWithChitCode: Beerfinder = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        chit_code: 'test-chit-code'
      };
      
      expect(isBeerfinder(beerWithTastedDate)).toBe(true);
      expect(isBeerfinder(beerWithRohLap)).toBe(true);
      expect(isBeerfinder(beerWithReviewRatings)).toBe(true);
      expect(isBeerfinder(beerWithChitCode)).toBe(true);
    });
    
    it('should return false for regular Beer objects without Beerfinder properties', () => {
      const regularBeer: Beer = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        brewer: 'Test Brewery'
      };
      
      expect(isBeerfinder(regularBeer)).toBe(false);
    });
    
    it('should return false for invalid objects', () => {
      expect(isBeerfinder(null)).toBe(false);
      expect(isBeerfinder(undefined)).toBe(false);
      expect(isBeerfinder({})).toBe(false);
    });
  });
  
  describe('isBeerDetails', () => {
    it('should return true for valid BeerDetails objects', () => {
      const validBeerDetails: BeerDetails = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        brewer: 'Test Brewery',
        abv: '5.5%',
        ibu: '45',
        availability: 'Year-round',
        seasonal: false,
        origin_country: 'USA',
        untappd_rating: '4.2',
        untappd_ratings_count: 1000
      };
      
      expect(isBeerDetails(validBeerDetails)).toBe(true);
    });
    
    it('should return true for Beer objects with at least one BeerDetails property', () => {
      const beerWithAbv: BeerDetails = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        abv: '5.5%'
      };
      
      const beerWithIbu: BeerDetails = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        ibu: '45'
      };
      
      const beerWithAvailability: BeerDetails = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        availability: 'Year-round'
      };
      
      const beerWithSeasonal: BeerDetails = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        seasonal: false
      };
      
      const beerWithOriginCountry: BeerDetails = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        origin_country: 'USA'
      };
      
      const beerWithUntappdRating: BeerDetails = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        untappd_rating: '4.2'
      };
      
      const beerWithUntappdRatingsCount: BeerDetails = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        untappd_ratings_count: 1000
      };
      
      expect(isBeerDetails(beerWithAbv)).toBe(true);
      expect(isBeerDetails(beerWithIbu)).toBe(true);
      expect(isBeerDetails(beerWithAvailability)).toBe(true);
      expect(isBeerDetails(beerWithSeasonal)).toBe(true);
      expect(isBeerDetails(beerWithOriginCountry)).toBe(true);
      expect(isBeerDetails(beerWithUntappdRating)).toBe(true);
      expect(isBeerDetails(beerWithUntappdRatingsCount)).toBe(true);
    });
    
    it('should return false for regular Beer objects without BeerDetails properties', () => {
      const regularBeer: Beer = {
        id: 'beer-123',
        brew_name: 'Test Beer',
        brewer: 'Test Brewery'
      };
      
      expect(isBeerDetails(regularBeer)).toBe(false);
    });
    
    it('should return false for invalid objects', () => {
      expect(isBeerDetails(null)).toBe(false);
      expect(isBeerDetails(undefined)).toBe(false);
      expect(isBeerDetails({})).toBe(false);
    });
  });
  
  describe('isCheckInResponse', () => {
    it('should return true for valid CheckInResponse objects', () => {
      const successResponse: CheckInResponse = {
        success: true,
        message: 'Check-in successful'
      };
      
      const errorResponse: CheckInResponse = {
        success: false,
        error: 'Check-in failed',
        message: 'Failed to check in beer'
      };
      
      expect(isCheckInResponse(successResponse)).toBe(true);
      expect(isCheckInResponse(errorResponse)).toBe(true);
    });
    
    it('should return false for objects without success property', () => {
      const missingSuccess = {
        message: 'Check-in successful'
      };
      
      expect(isCheckInResponse(missingSuccess)).toBe(false);
    });
    
    it('should return false for objects with wrong type for success property', () => {
      const wrongSuccessType = {
        success: 'true', // string instead of boolean
        message: 'Check-in successful'
      };
      
      expect(isCheckInResponse(wrongSuccessType)).toBe(false);
    });
    
    it('should return false for invalid objects', () => {
      expect(isCheckInResponse(null)).toBe(false);
      expect(isCheckInResponse(undefined)).toBe(false);
      expect(isCheckInResponse({})).toBe(false);
    });
  });
});
